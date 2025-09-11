import { ethers } from 'ethers';
import { uniswapFetcher, sushiswapFetcher, WETH, USDC, DAI, TOKEN_DECIMALS } from './priceFetcher.js';
import dotenv from 'dotenv';
dotenv.config();

const SWAP_FEE = 0.003; // 0.3%
const SAFETY_MARGIN = 0.001; // 0.1%
const GAS_ESTIMATE = 200000n; // Gas units
const INPUT_AMOUNT = ethers.parseEther('1'); // 1 ETH

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

class ArbitrageDetector {
  async detectSimpleArb(pair) {
    const [tokenA, tokenB] = pair;
    const priceUni = await uniswapFetcher.getPrice(tokenA, tokenB, INPUT_AMOUNT);
    const priceSushi = await sushiswapFetcher.getPrice(tokenA, tokenB, INPUT_AMOUNT);

    console.log(`Prices for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}: Uni ${priceUni}, Sushi ${priceSushi}`);  

    if (priceUni === 0 || priceSushi === 0) return null;

    let buyPrice, sellPrice, buyDex, sellDex;
    if (priceUni < priceSushi) {
      buyPrice = priceUni;
      sellPrice = priceSushi;
      buyDex = 'UniswapV2';
      sellDex = 'Sushiswap';
    } else if (priceSushi < priceUni) {
      buyPrice = priceSushi;
      sellPrice = priceUni;
      buyDex = 'Sushiswap';
      sellDex = 'UniswapV2';
    } else {
      return null;
    }
    

    console.log("BuyPice: ", buyPrice)
    console.log("SellPice: ", sellPrice)
    console.log("BuyDex: ", buyDex)
    console.log("SellDex: ", sellDex)

    console.log("Buy Price and Sell Price: ", {
        "BuyPice": buyPrice,
        "SellPice": sellPrice,
        "BuyDex": buyDex,
        "SellDex": sellDex
    })
    // Gross multiplier and profit
    const grossMultiplier = sellPrice / buyPrice;
    const grossProfit = Number(INPUT_AMOUNT) * (grossMultiplier - 1);
    const swapFees = Number(INPUT_AMOUNT) * SWAP_FEE * 2;
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice; // Use gasPrice from getFeeData
    const gasEth = Number(gasPrice * GAS_ESTIMATE) / 1e18;
    const totalCosts = swapFees + gasEth;
    const netProfit = grossProfit - totalCosts - (Number(INPUT_AMOUNT) * SAFETY_MARGIN);

   
    console.log("Gross Multiplier and Profit: ", {
        "Grossmultiplier": grossMultiplier,
        "GrossProfit": grossProfit,
        "SwapFee": swapFees,
        "FeeData": feeData,
        "GasPrice": gasPrice,
        "GasEth": gasEth,
        "TotalCosts": totalCosts,
        "NetProfit": netProfit
    })

    if (netProfit > 0) {
      const pairStr = `${tokenA.slice(0, 6)}-${tokenB.slice(0, 6)}`;
      return {
        pair: pairStr,
        buyDex,
        buyPrice,
        sellDex,
        sellPrice,
        netProfitEth: netProfit / 1e18,
        isTriangular: false
      };
    }
    return null;
  }

  async detectTriangularArb(dexFetcher, triangle) {
    const path = triangle;
    const amountOut = await dexFetcher.simulateMultiHop(path, INPUT_AMOUNT);
    const reversePath = [...path].reverse();
    const amountBack = await dexFetcher.simulateMultiHop(
      reversePath,
      ethers.parseUnits(amountOut.toString(), TOKEN_DECIMALS[path[path.length - 1].toLowerCase()] || 18)
    );

    const grossProfit = amountBack - Number(INPUT_AMOUNT);
    const swapFees = Number(INPUT_AMOUNT) * SWAP_FEE * 3;
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice; // Use gasPrice from getFeeData
    const gasEth = Number(gasPrice * GAS_ESTIMATE * 150000n / 100000n) / 1e18; // 1.5x gas
    const totalCosts = swapFees + gasEth;
    const netProfit = grossProfit - totalCosts - (Number(INPUT_AMOUNT) * SAFETY_MARGIN);

    console.log("TriangularArb: ",  {
        "Path": path, 
        "AmountOut": amountOut,
        "ReversePath": reversePath,
        "AmountBack": amountBack,
        "GrossProfit": grossProfit,
        "SwapFees": swapFees,
        "FeeData": feeData,
        "gasPrice": gasPrice,
        "gasEth": gasEth,
        "TotalCosts": totalCosts,
        "NetProfit": netProfit
    })

    if (netProfit > 0) {
      return {
        pair: `TRI-${path.map(t => t.slice(0, 6)).join('-')}`,
        dex: dexFetcher.name,
        netProfitEth: netProfit / 1e18,
        isTriangular: true,
        trianglePairs: path.map((t, i) => `${t.slice(0, 6)}-${path[(i + 1) % 3].slice(0, 6)}`).join(',')
      };
    }
    return null;
  }

  async scanAll() {
    const opportunities = [];

    

    // Simple arb
    const simplePairs = [[WETH, USDC]];
    for (const pair of simplePairs) {
      const opp = await this.detectSimpleArb(pair);
      if (opp) opportunities.push(opp);
    }

    // Triangular (bonus)
    const triangle = [WETH, USDC, DAI];
    const triUni = await this.detectTriangularArb(uniswapFetcher, triangle);
    if (triUni) opportunities.push(triUni);
    const triSushi = await this.detectTriangularArb(sushiswapFetcher, triangle);
    if (triSushi) opportunities.push(triSushi);

    console.log("Opportunities: ", opportunities)

    return opportunities;
  }
}

const arbDetector = new ArbitrageDetector();
export default arbDetector;