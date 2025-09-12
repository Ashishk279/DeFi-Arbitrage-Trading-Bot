
import { ethers } from 'ethers';
import { uniswapFetcher, sushiswapFetcher, WETH, USDC, DAI, TOKEN_DECIMALS } from './priceFetcher.js';
import { uniswapV3Fetcher, DEFAULT_FEE_TIER } from './priceFetcherV3.js';
import dotenv from 'dotenv';
dotenv.config();

const SWAP_FEE = 0.003; // 0.3% for V2; V3 approximated at 0.3%
const SAFETY_MARGIN = 0.001; // 0.1%
const GAS_ESTIMATE_SIMPLE = 200000n; // Gas units for simple arb
const GAS_ESTIMATE_TRIANGULAR = 300000n; // Gas units for triangular arb
const INPUT_AMOUNT = ethers.parseEther('0.01'); // 0.01 ETH

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

class ArbitrageDetector {
  async detectSimpleArbV2(pair) {
    try {
      const [tokenA, tokenB] = pair;
      const priceUniV2 = await uniswapFetcher.getPrice(tokenA, tokenB, INPUT_AMOUNT);
      const priceSushi = await sushiswapFetcher.getPrice(tokenA, tokenB, INPUT_AMOUNT);
      console.log(`V2 Prices for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}: UniV2 ${priceUniV2}, Sushi ${priceSushi}`);

      const prices = [
        { dex: 'UniswapV2', price: priceUniV2 },
        { dex: 'Sushiswap', price: priceSushi }
      ].filter(p => p.price > 0);

      if (prices.length < 2) {
        console.log('Insufficient valid V2 prices for arbitrage');
        return null;
      }

      prices.sort((a, b) => a.price - b.price);
      const buyPrice = prices[0].price;
      const sellPrice = prices[prices.length - 1].price;
      const buyDex = prices[0].dex;
      const sellDex = prices[prices.length - 1].dex;

      if (buyPrice === sellPrice) {
        console.log('No V2 price difference for arbitrage');
        return null;
      }

      console.log("V2 BuyPrice: ", buyPrice);
      console.log("V2 SellPrice: ", sellPrice);
      console.log("V2 BuyDex: ", buyDex);
      console.log("V2 SellDex: ", sellDex);

      console.log("V2 Buy Price and Sell Price: ", {
        BuyPrice: buyPrice,
        SellPrice: sellPrice,
        BuyDex: buyDex,
        SellDex: sellDex
      });

      const inputAmountNumber = Number(INPUT_AMOUNT) / 1e18;
      const grossMultiplier = sellPrice / buyPrice;
      const grossProfitEth = inputAmountNumber * (grossMultiplier - 1);
      const grossProfit = grossProfitEth * 1e18;
      const swapFeesEth = inputAmountNumber * SWAP_FEE * 2;
      const swapFees = swapFeesEth * 1e18;
      let gasPrice;
      try {
        const feeData = await provider.getFeeData();
        gasPrice = feeData.gasPrice;
      } catch (err) {
        console.error('Failed to fetch gas price (V2):', err.message);
        return null;
      }
      const gasEth = Number(gasPrice * GAS_ESTIMATE_SIMPLE) / 1e18;
      const totalCostsEth = swapFeesEth + gasEth;
      const totalCosts = totalCostsEth * 1e18;
      const netProfitEth = grossProfitEth - totalCostsEth - (inputAmountNumber * SAFETY_MARGIN);
      const netProfit = netProfitEth * 1e18;

      console.log("V2 Gross Multiplier and Profit: ", {
        GrossMultiplier: grossMultiplier,
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

      if (netProfitEth > 0) {
        const pairStr = `${tokenA.slice(0, 6)}-${tokenB.slice(0, 6)}`;
        return {
          pair: pairStr,
          buyDex,
          buyPrice,
          sellDex,
          sellPrice,
          netProfitEth,
          isTriangular: false,
          type: 'V2'
        };
      }
      return null;
    } catch (err) {
      console.error('Error in detectSimpleArbV2:', err.message);
      return null;
    }
  }

  async detectSimpleArbV3(pair) {
    try {
      const [tokenA, tokenB] = pair;
      const priceUniV3_3000 = await uniswapV3Fetcher.getPrice(tokenA, tokenB, INPUT_AMOUNT, 3000);
      const priceUniV3_500 = await uniswapV3Fetcher.getPrice(tokenA, tokenB, INPUT_AMOUNT, 500);
      console.log(`V3 Prices for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}: Fee3000 ${priceUniV3_3000}, Fee500 ${priceUniV3_500}`);

      const prices = [
        { dex: 'UniswapV3_3000', price: priceUniV3_3000 },
        { dex: 'UniswapV3_500', price: priceUniV3_500 }
      ].filter(p => p.price > 0);

      if (prices.length < 2) {
        console.log('Insufficient valid V3 prices for arbitrage');
        return null;
      }

      prices.sort((a, b) => a.price - b.price);
      const buyPrice = prices[0].price;
      const sellPrice = prices[prices.length - 1].price;
      const buyDex = prices[0].dex;
      const sellDex = prices[prices.length - 1].dex;

      if (buyPrice === sellPrice) {
        console.log('No V3 price difference for arbitrage');
        return null;
      }

      console.log("V3 BuyPrice: ", buyPrice);
      console.log("V3 SellPrice: ", sellPrice);
      console.log("V3 BuyDex: ", buyDex);
      console.log("V3 SellDex: ", sellDex);

      console.log("V3 Buy Price and Sell Price: ", {
        BuyPrice: buyPrice,
        SellPrice: sellPrice,
        BuyDex: buyDex,
        SellDex: sellDex
      });

      const inputAmountNumber = Number(INPUT_AMOUNT) / 1e18;
      const grossMultiplier = sellPrice / buyPrice;
      const grossProfitEth = inputAmountNumber * (grossMultiplier - 1);
      const grossProfit = grossProfitEth * 1e18;
      const swapFeesEth = inputAmountNumber * SWAP_FEE * 2;
      const swapFees = swapFeesEth * 1e18;
      let gasPrice;
      try {
        const feeData = await provider.getFeeData();
        gasPrice = feeData.gasPrice;
      } catch (err) {
        console.error('Failed to fetch gas price (V3):', err.message);
        return null;
      }
      const gasEth = Number(gasPrice * GAS_ESTIMATE_SIMPLE) / 1e18;
      const totalCostsEth = swapFeesEth + gasEth;
      const totalCosts = totalCostsEth * 1e18;
      const netProfitEth = grossProfitEth - totalCostsEth - (inputAmountNumber * SAFETY_MARGIN);
      const netProfit = netProfitEth * 1e18;

      console.log("V3 Gross Multiplier and Profit: ", {
        GrossMultiplier: grossMultiplier,
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

      if (netProfitEth > 0) {
        const pairStr = `${tokenA.slice(0, 6)}-${tokenB.slice(0, 6)}`;
        return {
          pair: pairStr,
          buyDex,
          buyPrice,
          sellDex,
          sellPrice,
          netProfitEth,
          isTriangular: false,
          type: 'V3'
        };
      }
      return null;
    } catch (err) {
      console.error('Error in detectSimpleArbV3:', err.message);
      return null;
    }
  }

  async detectSimpleArbV2vsV3(pair) {
    try {
      const [tokenA, tokenB] = pair;
      const priceUniV2 = await uniswapFetcher.getPrice(tokenA, tokenB, INPUT_AMOUNT);
      const priceSushi = await sushiswapFetcher.getPrice(tokenA, tokenB, INPUT_AMOUNT);
      const priceUniV3 = await uniswapV3Fetcher.getPrice(tokenA, tokenB, INPUT_AMOUNT, DEFAULT_FEE_TIER);
      console.log(`V2 vs V3 Prices for ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}: UniV2 ${priceUniV2}, Sushi ${priceSushi}, UniV3 ${priceUniV3}`);

      const prices = [
        { dex: 'UniswapV2', price: priceUniV2 },
        { dex: 'Sushiswap', price: priceSushi },
        { dex: 'UniswapV3', price: priceUniV3 }
      ].filter(p => p.price > 0);

      if (prices.length < 2) {
        console.log('Insufficient valid V2 vs V3 prices for arbitrage');
        return null;
      }

      prices.sort((a, b) => a.price - b.price);
      const buyPrice = prices[0].price;
      const sellPrice = prices[prices.length - 1].price;
      const buyDex = prices[0].dex;
      const sellDex = prices[prices.length - 1].dex;

      if (buyPrice === sellPrice) {
        console.log('No V2 vs V3 price difference for arbitrage');
        return null;
      }

      console.log("V2vsV3 BuyPrice: ", buyPrice);
      console.log("V2vsV3 SellPrice: ", sellPrice);
      console.log("V2vsV3 BuyDex: ", buyDex);
      console.log("V2vsV3 SellDex: ", sellDex);

      console.log("V2vsV3 Buy Price and Sell Price: ", {
        BuyPrice: buyPrice,
        SellPrice: sellPrice,
        BuyDex: buyDex,
        SellDex: sellDex
      });

      const inputAmountNumber = Number(INPUT_AMOUNT) / 1e18;
      const grossMultiplier = sellPrice / buyPrice;
      const grossProfitEth = inputAmountNumber * (grossMultiplier - 1);
      const grossProfit = grossProfitEth * 1e18;
      const swapFeesEth = inputAmountNumber * SWAP_FEE * 2;
      const swapFees = swapFeesEth * 1e18;
      let gasPrice;
      try {
        const feeData = await provider.getFeeData();
        gasPrice = feeData.gasPrice;
      } catch (err) {
        console.error('Failed to fetch gas price (V2vsV3):', err.message);
        return null;
      }
      const gasEth = Number(gasPrice * GAS_ESTIMATE_SIMPLE) / 1e18;
      const totalCostsEth = swapFeesEth + gasEth;
      const totalCosts = totalCostsEth * 1e18;
      const netProfitEth = grossProfitEth - totalCostsEth - (inputAmountNumber * SAFETY_MARGIN);
      const netProfit = netProfitEth * 1e18;

      console.log("V2vsV3 Gross Multiplier and Profit: ", {
        GrossMultiplier: grossMultiplier,
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

      if (netProfitEth > 0) {
        const pairStr = `${tokenA.slice(0, 6)}-${tokenB.slice(0, 6)}`;
        return {
          pair: pairStr,
          buyDex,
          buyPrice,
          sellDex,
          sellPrice,
          netProfitEth,
          isTriangular: false,
          type: 'V2vsV3'
        };
      }
      return null;
    } catch (err) {
      console.error('Error in detectSimpleArbV2vsV3:', err.message);
      return null;
    }
  }

  async detectTriangularArb(dexFetcher, triangle, isV3 = false) {
    try {
      const path = triangle;
      const fees = isV3 ? [DEFAULT_FEE_TIER, DEFAULT_FEE_TIER] : undefined;
      const reversePath = [...path].reverse();
      const reverseFees = isV3 ? [...fees].reverse() : undefined;

      let amountOut, amountBack;

      if (isV3) {
        amountOut = await dexFetcher.simulateMultiHop(path, fees, INPUT_AMOUNT);
        if (amountOut === 0) {
          console.log(`Triangular V3 failed: Zero amount out for path ${path.map(t => t.slice(0,6)).join('-')}`);
          return null;
        }
        const decOut = TOKEN_DECIMALS[path[path.length - 1].toLowerCase()] || 18;
        const decIn = TOKEN_DECIMALS[reversePath[0].toLowerCase()] || 18;
        amountBack = await dexFetcher.simulateMultiHop(
          reversePath,
          reverseFees,
          ethers.parseUnits(amountOut.toString(), decOut)
        );
      } else {
        amountOut = await dexFetcher.simulateMultiHop(path, INPUT_AMOUNT);
        if (amountOut === 0) {
          console.log(`Triangular V2 failed: Zero amount out for path ${path.map(t => t.slice(0,6)).join('-')}`);
          return null;
        }
        const decOut = TOKEN_DECIMALS[path[path.length - 1].toLowerCase()] || 18;
        const decIn = TOKEN_DECIMALS[reversePath[0].toLowerCase()] || 18;
        amountBack = await dexFetcher.simulateMultiHop(
          reversePath,
          ethers.parseUnits(amountOut.toString(), decOut)
        );
      }

      const inputAmountNumber = Number(INPUT_AMOUNT) / 1e18;
      const amountBackEth = Number(amountBack) / 1e18;
      const grossProfitEth = amountBackEth - inputAmountNumber;
      const grossProfit = grossProfitEth * 1e18;
      const swapFeesEth = inputAmountNumber * SWAP_FEE * 3;
      const swapFees = swapFeesEth * 1e18;
      let gasPrice;
      try {
        const feeData = await provider.getFeeData();
        gasPrice = feeData.gasPrice;
      } catch (err) {
        console.error(`Failed to fetch gas price in triangular arb (${dexFetcher.name}):`, err.message);
        return null;
      }
      const gasEth = Number(gasPrice * GAS_ESTIMATE_TRIANGULAR) / 1e18;
      const totalCostsEth = swapFeesEth + gasEth;
      const totalCosts = totalCostsEth * 1e18;
      const netProfitEth = grossProfitEth - totalCostsEth - (inputAmountNumber * SAFETY_MARGIN);
      const netProfit = netProfitEth * 1e18;

      console.log(`TriangularArb (${dexFetcher.name}):`, {
        Path: path.map(t => t.slice(0, 6)),
        AmountOut: amountOut,
        ReversePath: reversePath.map(t => t.slice(0, 6)),
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

      if (netProfitEth > 0) {
        return {
          pair: `TRI-${path.map(t => t.slice(0, 6)).join('-')}`,
          dex: dexFetcher.name,
          netProfitEth,
          isTriangular: true,
          trianglePairs: path.map((t, i) => `${t.slice(0, 6)}-${path[(i + 1) % 3].slice(0, 6)}`).join(','),
          type: isV3 ? 'V3' : 'V2'
        };
      }
      return null;
    } catch (err) {
      console.error(`Error in detectTriangularArb (${dexFetcher.name}):`, err.message);
      return null;
    }
  }

  async scanAll() {
    const opportunities = [];

    const simplePairs = [[WETH, USDC]];
    for (const pair of simplePairs) {
      const oppV2 = await this.detectSimpleArbV2(pair);
      if (oppV2) opportunities.push(oppV2);
      const oppV3 = await this.detectSimpleArbV3(pair);
      if (oppV3) opportunities.push(oppV3);
      const oppV2vsV3 = await this.detectSimpleArbV2vsV3(pair);
      if (oppV2vsV3) opportunities.push(oppV2vsV3);
    }

    const triangle = [WETH, USDC, DAI];
    const triUniV2 = await this.detectTriangularArb(uniswapFetcher, triangle);
    if (triUniV2) opportunities.push(triUniV2);
    const triSushi = await this.detectTriangularArb(sushiswapFetcher, triangle);
    if (triSushi) opportunities.push(triSushi);
    const triUniV3 = await this.detectTriangularArb(uniswapV3Fetcher, triangle, true);
    if (triUniV3) opportunities.push(triUniV3);

    console.log("Opportunities: ", opportunities);
    return opportunities;
  }
}

const arbDetector = new ArbitrageDetector();
export default arbDetector;
