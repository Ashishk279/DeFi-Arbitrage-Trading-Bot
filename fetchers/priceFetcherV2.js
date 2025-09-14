import { ethers } from 'ethers';
import wsProvider from '../providers/websocketProvider.js';
import { TOKEN_MAP, TOKEN_DECIMALS } from '../config/tokens.js';
import { VALID_TRADING_PAIRS } from '../config/tokens.js';

// ABI snippets
const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
];

const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external returns (uint[] memory amounts)'
];

// V2 DEX Addresses (Ethereum Mainnet)
const DEX_CONFIG = {
  UNISWAP_V2: {
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    name: 'UniswapV2'
  },
  SUSHISWAP: {
    router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
    name: 'Sushiswap'
  },
  PANCAKESWAP: {
    router: '0xEfF92A263d31888d860bD50809A8D171709b7b1c',
    name: 'PancakeSwap'
  }
};

class DEXPriceFetcherV2 {
  constructor(dexConfig) {
    this.config = dexConfig;
    this.name = dexConfig.name;
    this.provider = wsProvider.getProvider();
    this.router = new ethers.Contract(dexConfig.router, ROUTER_ABI, this.provider);
  }

  async getPrice(tokenA, tokenB, amountIn = ethers.parseEther('1'), pairAddress) {
    if (!pairAddress) {
      console.log(`❌ No pair address for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} on ${this.name}`);
      return 0;
    }

    try {
      const pair = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
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

      const amountInWithFee = amountIn * 997n;
      const numerator = amountInWithFee * reserveOut;
      const denominator = reserveIn * 1000n + amountInWithFee;
      const amountOut = numerator / denominator;

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

  async simulateMultiHop(path, amountIn, pairAddresses) {
    if (!pairAddresses || pairAddresses.some(addr => !addr)) {
      console.log(`❌ Missing pair addresses for path ${path.map(t => t.slice(0,6)).join('->')} on ${this.name}`);
      return 0;
    }

    try {
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
}

const uniswapV2Fetcher = new DEXPriceFetcherV2(DEX_CONFIG.UNISWAP_V2);
const sushiswapFetcher = new DEXPriceFetcherV2(DEX_CONFIG.SUSHISWAP);
const pancakeswapFetcher = new DEXPriceFetcherV2(DEX_CONFIG.PANCAKESWAP);

export async function getAllV2Prices(tokenA, tokenB, amountIn = ethers.parseEther('1')) {
  const pairData = VALID_TRADING_PAIRS.find(p => 
    (p.pair[0].toLowerCase() === tokenA.toLowerCase() && p.pair[1].toLowerCase() === tokenB.toLowerCase()) ||
    (p.pair[0].toLowerCase() === tokenB.toLowerCase() && p.pair[1].toLowerCase() === tokenA.toLowerCase())
  );

  if (!pairData) {
    console.log(`❌ No valid pair data for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}`);
    return [];
  }

  const prices = [];
  const dexes = [
    { fetcher: uniswapV2Fetcher, name: 'UniswapV2', address: pairData.pools.UniswapV2 },
    { fetcher: sushiswapFetcher, name: 'Sushiswap', address: pairData.pools.Sushiswap },
    { fetcher: pancakeswapFetcher, name: 'PancakeSwap', address: pairData.pools.PancakeSwap }
  ];

  for (const dex of dexes) {
    if (dex.address) {
      const price = await dex.fetcher.getPrice(tokenA, tokenB, amountIn, dex.address);
      if (price > 0) {
        prices.push({ dex: dex.name, price });
      }
    }
  }

  return prices;
}

export {
  uniswapV2Fetcher,
  sushiswapFetcher,
  pancakeswapFetcher,
  DEXPriceFetcherV2
};