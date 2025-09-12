import { ethers } from 'ethers';
import { Token } from '@uniswap/sdk-core';
import { computePoolAddress, FeeAmount } from '@uniswap/v3-sdk';
import dotenv from 'dotenv';
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
// Uniswap V3 ABIs
const V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint16[] memory fees)'
];

const V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function ticks(int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthGlobal0X128, uint256 feeGrowthGlobal1X128, uint128 tickCumulativeOutside, uint128 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)'
];

// Addresses (Mainnet)
const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const UNISWAP_V3_QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const UNISWAP_V3_QUOTER_V2_FALLBACK = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

// Tokens
const WETH_TOKEN = new Token(
  1,
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  18,
  'WETH',
  'Wrapped Ether'
);
const USDC_TOKEN = new Token(
  1,
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  6,
  'USDC',
  'USD//C'
);
const DAI_TOKEN = new Token(
  1,
  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  18,
  'DAI',
  'Dai Stablecoin'
);

const WBTC_TOKEN = new Token(1, '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 8, 'WBTC', 'Wrapped Bitcoin');
const UNI_TOKEN = new Token(1, '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 18, 'UNI', 'Uniswap');
const LINK_TOKEN = new Token(1, '0x514910771AF9Ca656af840dff83E8264EcF986CA', 18, 'LINK', 'Chainlink');

console.log("Token Information, ", {
    "WETH_TOKEN": WETH_TOKEN,
    "USDC_TOKEN": USDC_TOKEN,
    "DAI_TOKEN": DAI_TOKEN,
  
})

const TOKEN_MAP = {
  [WETH_TOKEN.address.toLowerCase()]: WETH_TOKEN,
  [USDC_TOKEN.address.toLowerCase()]: USDC_TOKEN,
  [DAI_TOKEN.address.toLowerCase()]: DAI_TOKEN,
  [WBTC_TOKEN.address.toLowerCase()]: WBTC_TOKEN,
  [UNI_TOKEN.address.toLowerCase()]: UNI_TOKEN,
  [LINK_TOKEN.address.toLowerCase()]: LINK_TOKEN
};

// Fee tiers
const FEE_TIERS = [FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH]; // 500, 3000, 10000

console.log("FEE_Tiers", FEE_TIERS)

class DEXPriceFetcherV3 {
  constructor(factoryAddress, quoterAddress, name) {
    if (!provider) {
      throw new Error('Provider not initialized. Check RPC_URL in .env');
    }
    this.factoryAddress = factoryAddress;
    this.quoter = new ethers.Contract(quoterAddress, V3_QUOTER_ABI, provider);
    this.fallbackQuoter = new ethers.Contract(UNISWAP_V3_QUOTER_V2_FALLBACK, V3_QUOTER_ABI, provider);
    this.name = name;
  }

  async getPoolAddress(tokenA, tokenB, fee = FeeAmount.MEDIUM) {
    try {
      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      if (!tokenAObj || !tokenBObj) {
        throw new Error(`Token not found: ${tokenA} or ${tokenB}`);
      }
      const poolAddr = computePoolAddress({
        factoryAddress: this.factoryAddress,
        tokenA: tokenAObj,
        tokenB: tokenBObj,
        fee
      });
      console.log(`Pool address for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}): ${poolAddr}`);
      return poolAddr;
    } catch (err) {
      console.error(`Error fetching pool address for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}):`, err.message);
      return ethers.ZeroAddress;
    }
  }

  async getPrice(tokenA, tokenB, amountIn = ethers.parseEther('0.01'), fee = FEE_TIERS.FeeAmount.LOW) {
     try {
    const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
    const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
    const isToken0 = tokenAObj.sortsBefore(tokenBObj);
    
    // Use proper decimals for the input token
    const inputToken = isToken0 ? tokenAObj : tokenBObj;
    const properAmountIn = ethers.parseUnits('1000', inputToken.decimals); // Use 1000 units of input token
    
    const params = {
      tokenIn: isToken0 ? tokenA : tokenB,
      tokenOut: isToken0 ? tokenB : tokenA,
      fee,
      amountIn: properAmountIn.toString(), // Use proper amount
      sqrtPriceLimitX96: 0
    };

    console.log("Params: ", params);
    console.log("Input token decimals:", inputToken.decimals);
    console.log("Proper amount:", properAmountIn.toString());

    const quote = await this.quoter.quoteExactInputSingle.staticCall(params);
    
    const amountOut = quote.amountOut;
    const decA = tokenAObj.decimals;
    const decB = tokenBObj.decimals;
    
    const price = isToken0
      ? Number(amountOut) / 10 ** decB / (Number(properAmountIn) / 10 ** decA)
      : (Number(properAmountIn) / 10 ** decA) / (Number(amountOut) / 10 ** decB);
      
    console.log(`On-chain V3 price for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}): ${price}`);
    return price;
  } catch (err) {
    console.error(`V3 quote error for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)} (fee: ${fee}):`, err.message);
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
      const decIn = TOKEN_MAP[path[0].toLowerCase()]?.decimals || 18;
      const decOut = TOKEN_MAP[path[path.length - 1].toLowerCase()]?.decimals || 18
      
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
async function test() {
  console.log("Testing Uniswap V3 Price Fetcher...");
  
  // Test pool addresses
  console.log("\nFetching pool addresses...");
  await uniswapV3Fetcher.getPoolAddress(WETH_TOKEN.address, USDC_TOKEN.address, FeeAmount.MEDIUM);
  await uniswapV3Fetcher.getPoolAddress(WETH_TOKEN.address, DAI_TOKEN.address, FeeAmount.MEDIUM);
  await uniswapV3Fetcher.getPoolAddress(USDC_TOKEN.address, DAI_TOKEN.address, FeeAmount.MEDIUM);

  // Test single-hop price
  console.log("\nFetching WETH/USDC price...");
  const price = await uniswapV3Fetcher.getPrice(WETH_TOKEN.address, DAI_TOKEN.address, ethers.parseEther('0.001'), FeeAmount.MEDIUM);
  console.log(`WETH/USDC Price: ${price} USDC per WETH`);

  // Test triangular arbitrage (WETH -> USDC -> DAI -> WETH)
  console.log("\nTesting triangular arbitrage...");
  const path = [WETH_TOKEN.address, USDC_TOKEN.address, DAI_TOKEN.address];
  const fees = [FeeAmount.MEDIUM, FeeAmount.MEDIUM];
  const amountIn = ethers.parseEther('0.001');
  const amountOut = await uniswapV3Fetcher.simulateMultiHop(path, fees, amountIn);

   
  console.log("Amount Out from WETH -> USDC -> DAI:", amountOut);
  if (amountOut > 0) {
    const decOut = DAI_TOKEN.decimals;
    const amountBack = await uniswapV3Fetcher.simulateMultiHop(
      [DAI_TOKEN.address, USDC_TOKEN.address, WETH_TOKEN.address],
      [FeeAmount.MEDIUM, FeeAmount.MEDIUM],
      ethers.parseUnits(amountOut.toString(), decOut)
    );
    const inputAmountNumber = Number(amountIn) / 1e18;
    const amountBackEth = amountBack;
    const grossProfitEth = amountBackEth - inputAmountNumber;
    const grossProfit = grossProfitEth * 1e18;
    const swapFeesEth = inputAmountNumber * 0.003 * 3;
    const swapFees = swapFeesEth * 1e18;
    const gasPrice = await provider.getFeeData().then(fee => fee.gasPrice);
    const gasEth = Number(gasPrice * 300000n) / 1e18;
    const totalCostsEth = swapFeesEth + gasEth;
    const totalCosts = totalCostsEth * 1e18;
    const netProfitEth = grossProfitEth - totalCostsEth - (inputAmountNumber * 0.001);
    const netProfit = netProfitEth * 1e18;

    console.log("Triangular Arbitrage Result:", {
      Path: path.map(t => t.slice(0, 6)),
      AmountOut: amountOut,
      ReversePath: [DAI_TOKEN.address, USDC_TOKEN.address, WETH_TOKEN.address].map(t => t.slice(0, 6)),
      AmountBack: amountBackEth,
      GrossProfitEth: grossProfitEth,
      GrossProfit: grossProfit,
      SwapFeesEth: swapFeesEth,
      SwapFees: swapFees,
      GasPrice: gasPrice.toString(),
      GasEth: gasEth,
      TotalCostsEth: totalCostsEth,
      TotalCosts: totalCosts,
      NetProfitEth: netProfitEth,
      NetProfit: netProfit
    });
  }
}

test().catch(err => console.error("Test failed:", err.message));



// export { uniswapV3Fetcher, WETH_TOKEN, USDC_TOKEN, DAI_TOKEN, FeeAmount };




