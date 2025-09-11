import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

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
  'function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] memory amounts)'
];

// Addresses (Ethereum Mainnet)
const UNISWAP_V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const SUSHISWAP_FACTORY = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac';
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const SUSHISWAP_ROUTER = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F';

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

const TOKEN_DECIMALS = { [WETH.toLowerCase()]: 18, [USDC.toLowerCase()]: 6, [DAI.toLowerCase()]: 18 };

class DEXPriceFetcher {
  constructor(factoryAddress, routerAddress, name) {
    this.factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
    this.router = new ethers.Contract(routerAddress, ROUTER_ABI, provider);
    this.name = name;
  }

  async getPairAddress(tokenA, tokenB) {
    return await this.factory.getPair(tokenA, tokenB);
  }

  async getPrice(tokenA, tokenB, amountIn = ethers.parseEther('1')) {
    const pairAddr = await this.getPairAddress(tokenA, tokenB);
    if (pairAddr === ethers.ZeroAddress) return 0;

    const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
    const [reserve0, reserve1] = await pair.getReserves();
    const token0 = await pair.token0();

    let reserveIn, reserveOut;
    if (token0.toLowerCase() === tokenA.toLowerCase()) {
      reserveIn = reserve0;
      reserveOut = reserve1;
    } else {
      reserveIn = reserve1;
      reserveOut = reserve0;
    }

    // Approximate getAmountOut: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    const amountInWithFee = amountIn * 997n;
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * 1000n + amountInWithFee;
    const amountOut = numerator / denominator;

    const decA = TOKEN_DECIMALS[tokenA.toLowerCase()] || 18;
    const decB = TOKEN_DECIMALS[tokenB.toLowerCase()] || 18;
    return Number(amountOut) / 10 ** decB / (Number(amountIn) / 10 ** decA);
  }

  async simulateMultiHop(path, amountIn) {
    const amounts = await this.router.getAmountsOut(amountIn, path);
    const decOut = TOKEN_DECIMALS[path[path.length - 1].toLowerCase()] || 18;
    return Number(amounts[amounts.length - 1]) / 10 ** decOut;
  }
}

const uniswapFetcher = new DEXPriceFetcher(UNISWAP_V2_FACTORY, UNISWAP_V2_ROUTER, 'UniswapV2');
const sushiswapFetcher = new DEXPriceFetcher(SUSHISWAP_FACTORY, SUSHISWAP_ROUTER, 'Sushiswap');

export { uniswapFetcher, sushiswapFetcher, WETH, USDC, DAI, TOKEN_DECIMALS };