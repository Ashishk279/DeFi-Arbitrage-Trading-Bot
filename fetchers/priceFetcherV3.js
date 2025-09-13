import { ethers } from 'ethers';
import { computePoolAddress, FeeAmount } from '@uniswap/v3-sdk';
import wsProvider from '../providers/websocketProvider.js';
import { TOKEN_MAP, TOKEN_DECIMALS } from '../config/tokens.js';

// Uniswap V3 ABIs
const V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32[] initializedTicksCrossed, uint256 gasEstimate)'
];

const V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];

const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
];

// V3 Addresses (Ethereum Mainnet)
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const UNISWAP_V3_QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';

// Fee tiers
const FEE_TIERS = [
  FeeAmount.LOWEST,  // 100
  FeeAmount.LOW,     // 500
  FeeAmount.MEDIUM,  // 3000
  FeeAmount.HIGH     // 10000
];

class DEXPriceFetcherV3 {
  constructor(factoryAddress = UNISWAP_V3_FACTORY, quoterAddress = UNISWAP_V3_QUOTER_V2, name = 'UniswapV3') {
    this.factoryAddress = factoryAddress;
    this.name = name;
    this.provider = wsProvider.getProvider();
    this.factory = new ethers.Contract(factoryAddress, V3_FACTORY_ABI, this.provider);
    this.quoter = new ethers.Contract(quoterAddress, V3_QUOTER_ABI, this.provider);
    
    // Cache for pool addresses and existence
    this.poolCache = new Map();
    this.poolExistsCache = new Map();
  }

  async getPoolAddress(tokenA, tokenB, fee = FeeAmount.MEDIUM) {
    const key = `${tokenA.toLowerCase()}-${tokenB.toLowerCase()}-${fee}`;
    const reverseKey = `${tokenB.toLowerCase()}-${tokenA.toLowerCase()}-${fee}`;
    
    if (this.poolCache.has(key)) {
      return this.poolCache.get(key);
    }
    
    if (this.poolCache.has(reverseKey)) {
      return this.poolCache.get(reverseKey);
    }

    try {
      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      
      if (!tokenAObj || !tokenBObj) {
        console.error(`Token not found in TOKEN_MAP: ${tokenA} or ${tokenB}`);
        return ethers.ZeroAddress;
      }

      const poolAddr = computePoolAddress({
        factoryAddress: this.factoryAddress,
        tokenA: tokenAObj,
        tokenB: tokenBObj,
        fee
      });

      // Verify pool exists
      const poolExists = await this.checkPoolExists(poolAddr);
      if (!poolExists) {
        this.poolCache.set(key, ethers.ZeroAddress);
        return ethers.ZeroAddress;
      }

      this.poolCache.set(key, poolAddr);
      console.log(`Pool found for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}): ${poolAddr.slice(0,10)}...`);
      return poolAddr;
    } catch (error) {
      console.error(`Error getting pool address for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}):`, error.message);
      return ethers.ZeroAddress;
    }
  }

  async checkPoolExists(poolAddress) {
    if (poolAddress === ethers.ZeroAddress) return false;
    
    if (this.poolExistsCache.has(poolAddress)) {
      return this.poolExistsCache.get(poolAddress);
    }

    try {
      const pool = new ethers.Contract(poolAddress, V3_POOL_ABI, this.provider);
      const liquidity = await pool.liquidity();
      const exists = liquidity > 0n;
      
      this.poolExistsCache.set(poolAddress, exists);
      return exists;
    } catch (error) {
      this.poolExistsCache.set(poolAddress, false);
      return false;
    }
  }

  async getPrice(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), fee = FeeAmount.MEDIUM) {
    try {
      // Check if pool exists first
      const poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
      if (poolAddress === ethers.ZeroAddress) {
        console.log(`No pool exists for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee})`);
        return 0;
      }

      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      
      if (!tokenAObj || !tokenBObj) {
        console.error(`Token objects not found for ${tokenA} or ${tokenB}`);
        return 0;
      }

      // Determine token order and proper amount
      const isToken0 = tokenAObj.sortsBefore(tokenBObj);
      const inputToken = isToken0 ? tokenAObj : tokenBObj;
      
      // Use proper decimals for input amount
      let properAmountIn;
      if (Number(amountIn) < 1e15) { // If amountIn seems too small
        properAmountIn = ethers.parseUnits('100', inputToken.decimals); // 100 units of input token
      } else {
        properAmountIn = amountIn;
      }

      const params = {
        tokenIn: isToken0 ? tokenA : tokenB,
        tokenOut: isToken0 ? tokenB : tokenA,
        fee,
        amountIn: properAmountIn.toString(),
        sqrtPriceLimitX96: 0
      };

      const quote = await this.quoter.quoteExactInputSingle.staticCall(params);
      const amountOut = quote.amountOut || quote[0]; // Handle different return formats

      if (!amountOut || amountOut === 0n) {
        console.log(`Zero amount out for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee})`);
        return 0;
      }

      // Calculate price
      const decA = tokenAObj.decimals;
      const decB = tokenBObj.decimals;
      
      const price = isToken0
        ? Number(amountOut) / 10 ** decB / (Number(properAmountIn) / 10 ** decA)
        : (Number(properAmountIn) / 10 ** decA) / (Number(amountOut) / 10 ** decB);
      
      console.log(`${this.name} price for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}): ${price.toFixed(6)}`);
      return price;
    } catch (error) {
      console.error(`V3 quote error for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}):`, error.message);
      return 0;
    }
  }

  async getBestPrice(tokenA, tokenB, amountIn = ethers.parseEther('0.01')) {
    const pricePromises = FEE_TIERS.map(fee => 
      this.getPrice(tokenA, tokenB, amountIn, fee)
        .then(price => ({ fee, price }))
        .catch(() => ({ fee, price: 0 }))
    );

    const results = await Promise.all(pricePromises);
    const validResults = results.filter(r => r.price > 0);
    
    if (validResults.length === 0) {
      console.log(`No valid prices found for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} across all fee tiers`);
      return { price: 0, fee: FeeAmount.MEDIUM };
    }

    // Return the best price (highest for selling, could be modified based on use case)
    const bestResult = validResults.reduce((best, current) => 
      current.price > best.price ? current : best
    );

    console.log(`Best V3 price for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}: ${bestResult.price.toFixed(6)} (fee: ${bestResult.fee})`);
    return bestResult;
  }

  async simulateMultiHop(path, fees, amountIn) {
    if (!fees || fees.length !== path.length - 1) {
      console.error(`Invalid fees array for path ${path.map(t => t.slice(0,6)).join('->')}. Expected ${path.length - 1} fees, got ${fees?.length}`);
      return 0;
    }

    try {
      // Check if all pools exist
      for (let i = 0; i < path.length - 1; i++) {
        const poolAddr = await this.getPoolAddress(path[i], path[i + 1], fees[i]);
        if (poolAddr === ethers.ZeroAddress) {
          console.log(`No pool for ${path[i].slice(0,6)}-${path[i + 1].slice(0,6)} (fee: ${fees[i]})`);
          return 0;
        }
      }

      // Encode path for multi-hop
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

  async getLiquidity(tokenA, tokenB, fee = FeeAmount.MEDIUM) {
    try {
      const poolAddr = await this.getPoolAddress(tokenA, tokenB, fee);
      if (poolAddr === ethers.ZeroAddress) return 0n;

      const pool = new ethers.Contract(poolAddr, V3_POOL_ABI, this.provider);
      const liquidity = await pool.liquidity();
      
      return liquidity;
    } catch (error) {
      console.error(`Error getting liquidity for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}):`, error.message);
      return 0n;
    }
  }
}

// Initialize V3 fetcher
const uniswapV3Fetcher = new DEXPriceFetcherV3();

// Utility function to get all V3 prices for a pair across different fee tiers
export async function getAllV3Prices(tokenA, tokenB, amountIn = ethers.parseEther('0.01')) {
  const pricePromises = FEE_TIERS.map(fee => 
    uniswapV3Fetcher.getPrice(tokenA, tokenB, amountIn, fee)
      .then(price => ({ dex: `UniswapV3_${fee}`, price, fee }))
      .catch(() => ({ dex: `UniswapV3_${fee}`, price: 0, fee }))
  );

  const results = await Promise.all(pricePromises);
  return results.filter(r => r.price > 0);
}

// Get best V3 price across all fee tiers
export async function getBestV3Price(tokenA, tokenB, amountIn = ethers.parseEther('0.01')) {
  return await uniswapV3Fetcher.getBestPrice(tokenA, tokenB, amountIn);
}

export {
  uniswapV3Fetcher,
  FeeAmount,
  FEE_TIERS,
  DEXPriceFetcherV3
};