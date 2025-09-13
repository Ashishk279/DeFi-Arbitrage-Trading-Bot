import { ethers } from 'ethers';
import wsProvider from '../providers/websocketProvider.js';
import { TOKEN_MAP, TOKEN_DECIMALS } from '../config/tokens.js';

// ABI snippets
const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
];

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)'
];

const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external returns (uint[] memory amounts)'
];

// V2 DEX Addresses (Ethereum Mainnet)
const DEX_CONFIG = {
  UNISWAP_V2: {
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    name: 'UniswapV2'
  },
  SUSHISWAP: {
    factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
    router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
    name: 'Sushiswap'
  },
  PANCAKESWAP: {
    factory: '0x1097053Fd2ea711dad45caCcc45EfF7548fCB362',
    router: '0xEfF92A263d31888d860bD50809A8D171709b7b1c',
    name: 'PancakeSwap'
  }
};

class DEXPriceFetcherV2 {
  constructor(dexConfig) {
    this.config = dexConfig;
    this.name = dexConfig.name;
    this.provider = wsProvider.getProvider();
    this.factory = new ethers.Contract(dexConfig.factory, FACTORY_ABI, this.provider);
    this.router = new ethers.Contract(dexConfig.router, ROUTER_ABI, this.provider);
    
    // Cache for pair addresses to reduce calls
    this.pairCache = new Map();
  }

  async getPairAddress(tokenA, tokenB) {
    const key = `${tokenA.toLowerCase()}-${tokenB.toLowerCase()}`;
    const reverseKey = `${tokenB.toLowerCase()}-${tokenA.toLowerCase()}`;
    
    if (this.pairCache.has(key)) {
      return this.pairCache.get(key);
    }
    
    if (this.pairCache.has(reverseKey)) {
      return this.pairCache.get(reverseKey);
    }

    try {
      const pairAddr = await this.factory.getPair(tokenA, tokenB);
      this.pairCache.set(key, pairAddr);
      return pairAddr;
    } catch (error) {
      console.error(`Error getting pair address for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} on ${this.name}:`, error.message);
      return ethers.ZeroAddress;
    }
  }

  async getPrice(tokenA, tokenB, amountIn = ethers.parseEther('1')) {
    try {
      const pairAddr = await this.getPairAddress(tokenA, tokenB);
      if (pairAddr === ethers.ZeroAddress) {
        console.log(`No pair found for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} on ${this.name}`);
        return 0;
      }

      const pair = new ethers.Contract(pairAddr, PAIR_ABI, this.provider);
      const [reserve0, reserve1] = await pair.getReserves();
      
      if (reserve0 === 0n || reserve1 === 0n) {
        console.log(`No liquidity for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} on ${this.name}`);
        return 0;
      }

      const token0 = await pair.token0();

      let reserveIn, reserveOut;
      if (token0.toLowerCase() === tokenA.toLowerCase()) {
        reserveIn = reserve0;
        reserveOut = reserve1;
      } else {
        reserveIn = reserve1;
        reserveOut = reserve0;
      }

      // Calculate output using Uniswap V2 formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
      const amountInWithFee = amountIn * 997n;
      const numerator = amountInWithFee * reserveOut;
      const denominator = reserveIn * 1000n + amountInWithFee;
      const amountOut = numerator / denominator;

      // Convert to proper decimal places
      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      const decA = tokenAObj?.decimals || 18;
      const decB = tokenBObj?.decimals || 18;
      
      const price = Number(amountOut) / 10 ** decB / (Number(amountIn) / 10 ** decA);
      
      console.log(`${this.name} price for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}: ${price.toFixed(6)}`);
      return price;
    } catch (error) {
      console.error(`Error getting price for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} on ${this.name}:`, error.message);
      return 0;
    }
  }

  async simulateMultiHop(path, amountIn) {
    try {
      // Check if all pairs exist
      for (let i = 0; i < path.length - 1; i++) {
        const pairAddr = await this.getPairAddress(path[i], path[i + 1]);
        if (pairAddr === ethers.ZeroAddress) {
          console.log(`No pair for ${path[i].slice(0,6)}-${path[i + 1].slice(0,6)} on ${this.name}`);
          return 0;
        }
      }

      const amounts = await this.router.getAmountsOut(amountIn, path);
      const finalAmount = amounts[amounts.length - 1];
      
      const outputToken = TOKEN_MAP[path[path.length - 1].toLowerCase()];
      const decOut = outputToken?.decimals || 18;
      
      const result = Number(finalAmount) / 10 ** decOut;
      console.log(`${this.name} multi-hop result for path ${path.map(t => t.slice(0,6)).join('->')}: ${result.toFixed(6)}`);
      return result;
    } catch (error) {
      console.error(`Error in multi-hop simulation on ${this.name} for path ${path.map(t => t.slice(0,6)).join('->')}:`, error.message);
      return 0;
    }
  }

  async getReserves(tokenA, tokenB) {
    try {
      const pairAddr = await this.getPairAddress(tokenA, tokenB);
      if (pairAddr === ethers.ZeroAddress) return { reserve0: 0n, reserve1: 0n };

      const pair = new ethers.Contract(pairAddr, PAIR_ABI, this.provider);
      const [reserve0, reserve1] = await pair.getReserves();
      
      return { reserve0, reserve1 };
    } catch (error) {
      console.error(`Error getting reserves for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} on ${this.name}:`, error.message);
      return { reserve0: 0n, reserve1: 0n };
    }
  }

  // Check if pair has sufficient liquidity for arbitrage
  async hasMinimumLiquidity(tokenA, tokenB, minLiquidityUSD = 10000) {
    try {
      const { reserve0, reserve1 } = await this.getReserves(tokenA, tokenB);
      
      if (reserve0 === 0n || reserve1 === 0n) return false;
      
      // Rough estimate - you might want to get actual token prices for accurate USD value
      const reserve0Number = Number(reserve0) / 1e18;
      const reserve1Number = Number(reserve1) / 1e18;
      
      // Simplified liquidity check (assumes both tokens have similar value)
      const estimatedLiquidityUSD = Math.min(reserve0Number, reserve1Number) * 2000; // Rough ETH price estimate
      
      return estimatedLiquidityUSD >= minLiquidityUSD;
    } catch (error) {
      console.error(`Error checking liquidity for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} on ${this.name}:`, error.message);
      return false;
    }
  }
}

// Initialize fetchers for different DEXs
const uniswapV2Fetcher = new DEXPriceFetcherV2(DEX_CONFIG.UNISWAP_V2);
const sushiswapFetcher = new DEXPriceFetcherV2(DEX_CONFIG.SUSHISWAP);
const pancakeswapFetcher = new DEXPriceFetcherV2(DEX_CONFIG.PANCAKESWAP);

// Utility function to get all V2 prices for a pair
export async function getAllV2Prices(tokenA, tokenB, amountIn = ethers.parseEther('1')) {
  const prices = await Promise.allSettled([
    uniswapV2Fetcher.getPrice(tokenA, tokenB, amountIn),
    sushiswapFetcher.getPrice(tokenA, tokenB, amountIn),
    pancakeswapFetcher.getPrice(tokenA, tokenB, amountIn)
  ]);

  return [
    { dex: 'UniswapV2', price: prices[0].status === 'fulfilled' ? prices[0].value : 0 },
    { dex: 'Sushiswap', price: prices[1].status === 'fulfilled' ? prices[1].value : 0 },
    { dex: 'PancakeSwap', price: prices[2].status === 'fulfilled' ? prices[2].value : 0 }
  ].filter(p => p.price > 0);
}

export {
  uniswapV2Fetcher,
  sushiswapFetcher,
  pancakeswapFetcher,
  DEXPriceFetcherV2
};