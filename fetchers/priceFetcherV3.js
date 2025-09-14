import { ethers } from 'ethers';
import { FeeAmount } from '@uniswap/v3-sdk';
import wsProvider from '../providers/websocketProvider.js';
import { TOKEN_MAP, TOKEN_DECIMALS } from '../config/tokens.js';
import { VALID_TRADING_PAIRS } from '../config/tokens.js';

const V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32[] initializedTicksCrossed, uint256 gasEstimate)'
];

const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
];

const UNISWAP_V3_QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const SUSHISWAP_V3_QUOTER = '0xbC203d7F836BbE7b0B9E34E31fB7B5F753A5a4C8'; // Placeholder: Replace with actual Sushiswap V3 quoter
const PANCAKESWAP_V3_QUOTER = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'; // Placeholder: Replace with actual PancakeSwap V3 quoter

class DEXPriceFetcherV3 {
  constructor(quoterAddress, name) {
    this.name = name;
    this.provider = wsProvider.getProvider();
    this.quoter = new ethers.Contract(quoterAddress, V3_QUOTER_ABI, this.provider);
  }

  async getPrice(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), fee = FeeAmount.MEDIUM, poolAddress) {
    if (!poolAddress) {
      console.log(`❌ No pool address for ${TOKEN_MAP[tokenA.toLowerCase()]?.symbol || tokenA.slice(0,6)}-${TOKEN_MAP[tokenB.toLowerCase()]?.symbol || tokenB.slice(0,6)} (fee: ${fee}) on ${this.name}`);
      return { price: 0, amountOut: 0n };
    }

    try {
      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      
      if (!tokenAObj || !tokenBObj) {
        console.error(`Token objects not found for ${tokenA} or ${tokenB}`);
        return { price: 0, amountOut: 0n };
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
        console.log(`Zero amount out for ${tokenAObj.symbol}-${tokenBObj.symbol} (fee: ${fee})`);
        return { price: 0, amountOut: 0n };
      }

      const decA = tokenAObj.decimals;
      const decB = tokenBObj.decimals;
      
      const price = isToken0
        ? Number(amountOut) / 10 ** decB / (Number(properAmountIn) / 10 ** decA)
        : (Number(properAmountIn) / 10 ** decA) / (Number(amountOut) / 10 ** decB);

      console.log(`📈 ${this.name} Price Data:`);
      console.log(`   Token In: ${tokenAObj.symbol} (${tokenA})`);
      console.log(`   Token Out: ${tokenBObj.symbol} (${tokenB})`);
      console.log(`   Pool Address: ${poolAddress}`);
      console.log(`   Fee Tier: ${fee} (${(fee / 10000).toFixed(4)}%)`);
      console.log(`   Input Amount: ${(Number(properAmountIn) / 10 ** decA).toFixed(decA)} ${tokenAObj.symbol}`);
      console.log(`   Output Amount: ${(Number(amountOut) / 10 ** decB).toFixed(decB)} ${tokenBObj.symbol}`);
      console.log(`   Price: ${price.toFixed(18)} (${tokenBObj.symbol}/${tokenAObj.symbol})`);

      return { price, amountOut };
    } catch (error) {
      console.error(`V3 quote error for ${TOKEN_MAP[tokenA.toLowerCase()]?.symbol || tokenA.slice(0,6)}-${TOKEN_MAP[tokenB.toLowerCase()]?.symbol || tokenB.slice(0,6)} (fee: ${fee}):`, error.message);
      return { price: 0, amountOut: 0n };
    }
  }

  async simulateMultiHop(path, fees, amountIn, poolAddresses) {
    if (!poolAddresses || poolAddresses.some(addr => !addr)) {
      console.log(`❌ Missing pool addresses for path ${path.map(t => TOKEN_MAP[t.toLowerCase()]?.symbol || t.slice(0,6)).join('->')} on ${this.name}`);
      return { amountOut: 0, amounts: [] };
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
      
      const result = Number(amountOut) / 10 ** decOut;

      console.log(`🔄 ${this.name} Multi-Hop Simulation:`);
      console.log(`   Path: ${path.map(t => TOKEN_MAP[t.toLowerCase()]?.symbol || t.slice(0,6)).join('->')}`);
      console.log(`   Pool Addresses: ${poolAddresses.join(', ')}`);
      console.log(`   Fee Tiers: ${fees.map(f => `${f} (${(f / 10000).toFixed(4)}%)`).join(', ')}`);
      console.log(`   Input Amount: ${(Number(amountIn) / 10 ** decIn).toFixed(decIn)} ${inputToken?.symbol}`);
      console.log(`   Output Amount: ${result.toFixed(decOut)} ${outputToken?.symbol}`);

      return { amountOut: result, amounts: [amountIn, amountOut] };
    } catch (error) {
      console.error(`V3 multi-hop error for path ${path.map(t => TOKEN_MAP[t.toLowerCase()]?.symbol || t.slice(0,6)).join('->')}:`, error.message);
      return { amountOut: 0, amounts: [] };
    }
  }
}

const uniswapV3Fetcher = new DEXPriceFetcherV3(UNISWAP_V3_QUOTER_V2, 'UniswapV3');
const sushiswapV3Fetcher = new DEXPriceFetcherV3(SUSHISWAP_V3_QUOTER, 'SushiswapV3');
const pancakeswapV3Fetcher = new DEXPriceFetcherV3(PANCAKESWAP_V3_QUOTER, 'PancakeSwapV3');

export async function getAllV3Prices(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), fee = FeeAmount.MEDIUM) {
  const pairData = VALID_TRADING_PAIRS.find(p => 
    (p.pair[0].toLowerCase() === tokenA.toLowerCase() && p.pair[1].toLowerCase() === tokenB.toLowerCase()) ||
    (p.pair[0].toLowerCase() === tokenB.toLowerCase() && p.pair[1].toLowerCase() === tokenA.toLowerCase())
  );

  if (!pairData) {
    console.log(`❌ No valid pair data for ${TOKEN_MAP[tokenA.toLowerCase()]?.symbol || tokenA.slice(0,6)}-${TOKEN_MAP[tokenB.toLowerCase()]?.symbol || tokenB.slice(0,6)}`);
    return [];
  }

  const prices = [];
  const dexes = [
    { fetcher: uniswapV3Fetcher, name: 'UniswapV3', pool: pairData.pools.UniswapV3.find(p => p.fee === fee) },
    { fetcher: sushiswapV3Fetcher, name: 'SushiswapV3', pool: pairData.pools.SushiswapV3.find(p => p.fee === fee) },
    { fetcher: pancakeswapV3Fetcher, name: 'PancakeSwapV3', pool: pairData.pools.PancakeSwapV3.find(p => p.fee === fee) }
  ];

  for (const dex of dexes) {
    if (dex.pool) {
      const { price, amountOut } = await dex.fetcher.getPrice(tokenA, tokenB, amountIn, fee, dex.pool.address);
      if (price > 0) {
        prices.push({ dex: `${dex.name}_${fee}`, price, amountOut, fee });
      }
    }
  }

  return prices;
}

export async function getBestV3Price(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), preferredFee = FeeAmount.MEDIUM) {
  const prices = await getAllV3Prices(tokenA, tokenB, amountIn, preferredFee);
  if (prices.length > 0) {
    prices.sort((a, b) => a.price - b.price);
    return { price: prices[0].price, amountOut: prices[0].amountOut, fee: prices[0].fee, dex: prices[0].dex };
  }
  return { price: 0, amountOut: 0n, fee: preferredFee, dex: '' };
}

export {
  uniswapV3Fetcher,
  sushiswapV3Fetcher,
  pancakeswapV3Fetcher,
  FeeAmount,
  DEXPriceFetcherV3
};