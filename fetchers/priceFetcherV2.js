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

  async getPrice(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), pairAddress) {
    if (!pairAddress) {
      console.log(`❌ No pair address for ${TOKEN_MAP[tokenA.toLowerCase()]?.symbol || tokenA.slice(0,6)}-${TOKEN_MAP[tokenB.toLowerCase()]?.symbol || tokenB.slice(0,6)} on ${this.name}`);
      return { price: 0, amountOut: 0n };
    }

    try {
      const pair = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
      const [reserve0, reserve1] = await pair.getReserves();
      
      if (reserve0 === 0n || reserve1 === 0n) {
        console.log(`No liquidity for ${TOKEN_MAP[tokenA.toLowerCase()]?.symbol || tokenA.slice(0,6)}-${TOKEN_MAP[tokenB.toLowerCase()]?.symbol || tokenB.slice(0,6)} on ${this.name}`);
        return { price: 0, amountOut: 0n };
      }

      const token0 = await pair.token0();
      let reserveIn, reserveOut;
      const isToken0 = token0.toLowerCase() === tokenA.toLowerCase();
      reserveIn = isToken0 ? reserve0 : reserve1;
      reserveOut = isToken0 ? reserve1 : reserve0;

      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      const decA = tokenAObj?.decimals || 18;
      const decB = tokenBObj?.decimals || 18;

      const amountInWithFee = amountIn * 997n;
      const numerator = amountInWithFee * reserveOut;
      const denominator = reserveIn * 1000n + amountInWithFee;
      const amountOut = numerator / denominator;

      const price = Number(amountOut) / 10 ** decB / (Number(amountIn) / 10 ** decA);
      
      console.log(`📈 ${this.name} Price Data:`);
      console.log(`   Token In: ${tokenAObj?.symbol} (${tokenA})`);
      console.log(`   Token Out: ${tokenBObj?.symbol} (${tokenB})`);
      console.log(`   Pool Address: ${pairAddress}`);
      console.log(`   Input Amount: ${(Number(amountIn) / 10 ** decA).toFixed(decA)} ${tokenAObj?.symbol}`);
      console.log(`   Output Amount: ${(Number(amountOut) / 10 ** decB).toFixed(decB)} ${tokenBObj?.symbol}`);
      console.log(`   Price: ${price.toFixed(18)} (${tokenBObj?.symbol}/${tokenAObj?.symbol})`);

      return { price, amountOut };
    } catch (error) {
      console.error(`Error getting price for ${TOKEN_MAP[tokenA.toLowerCase()]?.symbol || tokenA.slice(0,6)}-${TOKEN_MAP[tokenB.toLowerCase()]?.symbol || tokenB.slice(0,6)} on ${this.name}:`, error.message);
      return { price: 0, amountOut: 0n };
    }
  }

  async simulateMultiHop(path, amountIn, pairAddresses) {
    if (!pairAddresses || pairAddresses.some(addr => !addr)) {
      console.log(`❌ Missing pair addresses for path ${path.map(t => TOKEN_MAP[t.toLowerCase()]?.symbol || t.slice(0,6)).join('->')} on ${this.name}`);
      return { amountOut: 0, amounts: [] };
    }

    try {
      const amounts = await this.router.getAmountsOut(amountIn, path);
      const finalAmount = amounts[amounts.length - 1];
      
      const outputToken = TOKEN_MAP[path[path.length - 1].toLowerCase()];
      const inputToken = TOKEN_MAP[path[0].toLowerCase()];
      const decOut = outputToken?.decimals || 18;
      const decIn = inputToken?.decimals || 18;
      
      const result = Number(finalAmount) / 10 ** decOut;

      console.log(`🔄 ${this.name} Multi-Hop Simulation:`);
      console.log(`   Path: ${path.map(t => TOKEN_MAP[t.toLowerCase()]?.symbol || t.slice(0,6)).join('->')}`);
      console.log(`   Pool Addresses: ${pairAddresses.join(', ')}`);
      console.log(`   Input Amount: ${(Number(amountIn) / 10 ** decIn).toFixed(decIn)} ${inputToken?.symbol}`);
      console.log(`   Output Amount: ${result.toFixed(decOut)} ${outputToken?.symbol}`);
      amounts.slice(1).forEach((amt, i) => {
        const token = TOKEN_MAP[path[i + 1].toLowerCase()];
        console.log(`   Hop ${i + 1}: ${(Number(amt) / 10 ** (token?.decimals || 18)).toFixed(token?.decimals || 18)} ${token?.symbol}`);
      });

      return { amountOut: result, amounts };
    } catch (error) {
      console.error(`Error in multi-hop simulation on ${this.name} for path ${path.map(t => TOKEN_MAP[t.toLowerCase()]?.symbol || t.slice(0,6)).join('->')}:`, error.message);
      return { amountOut: 0, amounts: [] };
    }
  }
}

const uniswapV2Fetcher = new DEXPriceFetcherV2(DEX_CONFIG.UNISWAP_V2);
const sushiswapFetcher = new DEXPriceFetcherV2(DEX_CONFIG.SUSHISWAP);
const pancakeswapFetcher = new DEXPriceFetcherV2(DEX_CONFIG.PANCAKESWAP);

export async function getAllV2Prices(tokenA, tokenB, amountIn = ethers.parseEther('0.01')) {
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
    { fetcher: uniswapV2Fetcher, name: 'UniswapV2', address: pairData.pools.UniswapV2 },
    { fetcher: sushiswapFetcher, name: 'Sushiswap', address: pairData.pools.Sushiswap },
    { fetcher: pancakeswapFetcher, name: 'PancakeSwap', address: pairData.pools.PancakeSwap }
  ];

  for (const dex of dexes) {
    if (dex.address) {
      const { price, amountOut } = await dex.fetcher.getPrice(tokenA, tokenB, amountIn, dex.address);
      if (price > 0) {
        prices.push({ dex: dex.name, price, amountOut });
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