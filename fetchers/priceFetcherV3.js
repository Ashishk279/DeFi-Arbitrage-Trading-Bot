import { ethers } from 'ethers';
import { FeeAmount } from '@uniswap/v3-sdk';
import wsProvider from '../providers/websocketProvider.js';
import { TOKEN_MAP, TOKEN_DECIMALS } from '../config/tokens.js';
import { VALID_TRADING_PAIRS } from '../config/tokens.js';

const V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut,uint256 amountIn, uint24 fee,  uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32[] initializedTicksCrossed, uint256 gasEstimate)'
];

const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
];

const UNISWAP_V3_QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';

class DEXPriceFetcherV3 {
  constructor(quoterAddress = UNISWAP_V3_QUOTER_V2, name = 'UniswapV3') {
    this.name = name;
    this.provider = wsProvider.getProvider();
    this.quoter = new ethers.Contract(quoterAddress, V3_QUOTER_ABI, this.provider);
  }

  async getPrice(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), fee = FeeAmount.MEDIUM, poolAddress) {
    if (!poolAddress) {
      console.log(`❌ No pool address for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}) on ${this.name}`);
      return 0;
    }

    try {
      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      
      if (!tokenAObj || !tokenBObj) {
        console.error(`Token objects not found for ${tokenA} or ${tokenB}`);
        return 0;
      }

      const isToken0 = tokenAObj.sortsBefore(tokenBObj);
      const inputToken = isToken0 ? tokenAObj : tokenBObj;
      
      let properAmountIn;
      if (Number(amountIn) < 1e15) {
        properAmountIn = ethers.parseUnits('100', inputToken.decimals);
      } else {
        properAmountIn = amountIn;
      }

      const params = {
        tokenIn: isToken0 ? tokenA : tokenB,
        tokenOut: isToken0 ? tokenB : tokenA,
        amountIn: properAmountIn.toString(),
        fee,
        sqrtPriceLimitX96: 0
      };

      const quote = await this.quoter.quoteExactInputSingle.staticCall(params);
      const amountOut = quote.amountOut || quote[0];

      if (!amountOut || amountOut === 0n) {
        console.log(`Zero amount out for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee})`);
        return 0;
      }

      const decA = tokenAObj.decimals;
      const decB = tokenBObj.decimals;
      
      const price = isToken0
        ? Number(amountOut) / 10 ** decB / (Number(properAmountIn) / 10 ** decA)
        : (Number(properAmountIn) / 10 ** decA) / (Number(amountOut) / 10 ** decB);
      
      console.log(`${this.name} price for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}): ${price.toFixed(18)}`);
      return price;
    } catch (error) {
      console.error(`V3 quote error for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}):`, error.message);
      return 0;
    }
  }

  async simulateMultiHop(path, fees, amountIn, poolAddresses) {
    if (!poolAddresses || poolAddresses.some(addr => !addr)) {
      console.log(`❌ Missing pool addresses for path ${path.map(t => t.slice(0,6)).join('->')} on ${this.name}`);
      return 0;
    }

    try {
      let encodedPath = ethers.solidityPacked(['address', 'uint24', 'address'], [path[0], fees[0], path[1]]);
      for (let i = 1; i < fees.length; i++) {
        encodedPath = ethers.concat([encodedPath, ethers.solidityPacked(['uint24', 'address'], [fees[i], path[i + 1]])]);
      }

      const quote = await this.quoter.quoteExactInput.staticCall(encodedPath, amountIn);
      const amountOut = quote.amountOut || quote[0];

      const outputToken = TOKEN_MAP[path[path.length - 1].toLowerCase()];
      const inputToken = TOKEN_MAP[path[0].toLowerCase()];
      const decOut = outputToken?.decimals || 18;
      const decIn = inputToken?.decimals || 18;
      
      const result = Number(amountOut) / 10 ** decOut / (Number(amountIn) / 10 ** decIn);
      
      console.log(`${this.name} multi-hop result for path ${path.map(t => t.slice(0,6)).join('->')}: ${result.toFixed(6)}`);
      return result;
    } catch (error) {
      console.error(`V3 multi-hop error for path ${path.map(t => t.slice(0,6)).join('->')}:`, error.message);
      return 0;
    }
  }
}

const uniswapV3Fetcher = new DEXPriceFetcherV3();

export async function getAllV3Prices(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), fee = FeeAmount.MEDIUM) {
  const pairData = VALID_TRADING_PAIRS.find(p => 
    (p.pair[0].toLowerCase() === tokenA.toLowerCase() && p.pair[1].toLowerCase() === tokenB.toLowerCase()) ||
    (p.pair[0].toLowerCase() === tokenB.toLowerCase() && p.pair[1].toLowerCase() === tokenA.toLowerCase())
  );

  if (!pairData) {
    console.log(`❌ No valid pair data for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}`);
    return [];
  }

  const pool = pairData.pools.UniswapV3.find(p => p.fee === fee);
  if (!pool) {
    console.log(`❌ No UniswapV3 pool for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee})`);
    return [];
  }

  const price = await uniswapV3Fetcher.getPrice(tokenA, tokenB, amountIn, fee, pool.address);
  if (price > 0) {
    return [{ dex: `UniswapV3_${fee}`, price, fee }];
  }
  return [];
}

export async function getBestV3Price(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), preferredFee = FeeAmount.MEDIUM) {
  const prices = await getAllV3Prices(tokenA, tokenB, amountIn, preferredFee);
  if (prices.length > 0) {
    return { price: prices[0].price, fee: prices[0].fee };
  }
  return { price: 0, fee: preferredFee };
}

export {
  uniswapV3Fetcher,
  FeeAmount,
  DEXPriceFetcherV3
};