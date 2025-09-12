import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// Uniswap V3 ABIs
const V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];

const V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint16[] memory fees)'
];

// Addresses (Mainnet)
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const UNISWAP_V3_QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const UNISWAP_V3_QUOTER_V2_FALLBACK = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

// Tokens
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

const TOKEN_DECIMALS = { [WETH.toLowerCase()]: 18, [USDC.toLowerCase()]: 6, [DAI.toLowerCase()]: 18 };

// Default fee tier (3000 = 0.3%)
const DEFAULT_FEE_TIER = 3000;
const ALTERNATIVE_FEE_TIERS = [500, 10000];

class DEXPriceFetcherV3 {
  constructor(factoryAddress, quoterAddress, name) {
    if (!provider) {
      throw new Error('Provider not initialized. Check RPC_URL in .env');
    }
    this.factory = new ethers.Contract(factoryAddress, V3_FACTORY_ABI, provider);
    this.quoter = new ethers.Contract(quoterAddress, V3_QUOTER_ABI, provider);
    this.fallbackQuoter = new ethers.Contract(UNISWAP_V3_QUOTER_V2_FALLBACK, V3_QUOTER_ABI, provider);
    this.name = name;
  }

  async getPoolAddress(tokenA, tokenB, fee = DEFAULT_FEE_TIER) {
    try {
      const [sortedTokenA, sortedTokenB] = [tokenA, tokenB].sort();
      const poolAddr = await this.factory.getPool(sortedTokenA, sortedTokenB, fee);
      console.log(`Pool address for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}): ${poolAddr}`);
      return poolAddr;
    } catch (err) {
      console.error(`Error fetching pool address for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}):`, err.message);
      return ethers.ZeroAddress;
    }
  }

  async getPrice(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), fee = DEFAULT_FEE_TIER) {
    let currentFee = fee;
    let poolAddr = await this.getPoolAddress(tokenA, tokenB, currentFee);

    if (poolAddr === ethers.ZeroAddress) {
      for (const altFee of ALTERNATIVE_FEE_TIERS) {
        console.log(`Retrying with fee tier ${altFee} for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}`);
        poolAddr = await this.getPoolAddress(tokenA, tokenB, altFee);
        if (poolAddr !== ethers.ZeroAddress) {
          currentFee = altFee;
          break;
        }
      }
    }

    if (poolAddr === ethers.ZeroAddress) {
      console.log(`No pool found for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} after trying all fee tiers`);
      return 0;
    }

    try {
      const [sortedTokenA, sortedTokenB] = [tokenA, tokenB].sort();
      const isReverse = tokenA !== sortedTokenA; // Check if token order is reversed
      const params = {
        tokenIn: tokenA,
        tokenOut: tokenB,
        fee: currentFee,
        amountIn: amountIn.toString(),
        sqrtPriceLimitX96: 0
      };

      console.log("Params: ", params);

      let quote;
      try {
        quote = await this.quoter.quoteExactInputSingle.staticCall(params);
        console.log("Quote: ", quote)
      } catch (err) {
        console.log(`Retrying with fallback quoter for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${currentFee})`);
        quote = await this.fallbackQuoter.quoteExactInputSingle.staticCall(params);
      }

      const amountOut = quote.amountOut;
      const decA = TOKEN_DECIMALS[tokenA.toLowerCase()] || 18;
      const decB = TOKEN_DECIMALS[tokenB.toLowerCase()] || 18;
      const price = Number(amountOut) / 10 ** decB / (Number(amountIn) / 10 ** decA);
      console.log(`V3 price for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${currentFee}): ${price}`);
      return price;
    } catch (err) {
      console.error(`V3 quote error for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${currentFee}):`, err.message);
      return 0;
    }
  }

  async simulateMultiHop(path, fees, amountIn) {
    if (!fees || fees.length !== path.length - 1) {
      console.error(`Invalid fees array for path ${path.map(t => t.slice(0,6)).join('-')}:`, fees);
      return 0;
    }

    let encodedPath;
    try {
      encodedPath = ethers.solidityPacked(['address', 'uint24', 'address'], [path[0], fees[0], path[1]]);
      for (let i = 1; i < fees.length; i++) {
        encodedPath = ethers.concat([encodedPath, ethers.solidityPacked(['uint24', 'address'], [fees[i], path[i + 1]])]);
      }
    } catch (err) {
      console.error(`Error encoding path for ${path.map(t => t.slice(0,6)).join('-')}:`, err.message);
      return 0;
    }

    try {
      const quote = await this.quoter.quoteExactInput.staticCall(encodedPath, amountIn);
      const amountOut = quote.amountOut;
      const decIn = TOKEN_DECIMALS[path[0].toLowerCase()] || 18;
      const decOut = TOKEN_DECIMALS[path[path.length - 1].toLowerCase()] || 18;
      const result = Number(amountOut) / 10 ** decOut / (Number(amountIn) / 10 ** decIn);
      console.log(`V3 multi-hop result for path ${path.map(t => t.slice(0,6)).join('-')}: ${result}`);
      return result;
    } catch (err) {
      console.error(`V3 multi-hop quote error for path ${path.map(t => t.slice(0,6)).join('-')}:`, err.message);
      return 0;
    }
  }
}

const uniswapV3Fetcher = new DEXPriceFetcherV3(UNISWAP_V3_FACTORY, UNISWAP_V3_QUOTER_V2, 'UniswapV3');

export { uniswapV3Fetcher, WETH, USDC, DAI, TOKEN_DECIMALS, DEFAULT_FEE_TIER };