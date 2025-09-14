import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import wsProvider from '../providers/websocketProvider.js';
import { getAllV2Prices, uniswapV2Fetcher, sushiswapFetcher, pancakeswapFetcher } from '../fetchers/priceFetcherV2.js';
import { getAllV3Prices, getBestV3Price, FeeAmount, uniswapV3Fetcher, sushiswapV3Fetcher, pancakeswapV3Fetcher } from '../fetchers/priceFetcherV3.js';
import { VALID_TRADING_PAIRS, VALID_TRIANGULAR_PATHS, TOKEN_MAP, TOKENS } from '../config/tokens.js';
import Opportunity from '../models/Opportunity.js';

const SWAP_FEE_V2 = 0.003;
const SWAP_FEE_V3 = 0.003;
const SWAP_FEE_AAVE_COMP = 0.01;
const SAFETY_MARGIN = 0.001;
const GAS_ESTIMATE_SIMPLE = 200000n;
const GAS_ESTIMATE_TRIANGULAR = 300000n;
const INPUT_AMOUNT = ethers.parseEther('0.000000001');
const PREFERRED_FEE_TIER = FeeAmount.MEDIUM; // 0.3% fee tier (3000)
const ETH_PRICE_USD = 2500; // Placeholder USD price

class ArbitrageDetector extends EventEmitter {
  constructor() {
    super();
    this.provider = wsProvider.getProvider();
    this.ethPrice = ETH_PRICE_USD;
    this.listeners = {};
  }

  async updateEthPrice() {
    try {
      this.ethPrice = ETH_PRICE_USD; // Replace with Chainlink price feed in production
      console.log(`💰 Updated ETH Price: $${this.ethPrice}`);
    } catch (error) {
      console.error('Error updating ETH price:', error.message);
    }
  }

  async detectV2SimpleArbitrage(pairData) {
    try {
      const [tokenA, tokenB] = pairData.pair;
      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      console.log(`\n🔍 Scanning V2 Simple Arbitrage: ${tokenAObj.symbol}-${tokenBObj.symbol}`);

      const prices = await getAllV2Prices(tokenA, tokenB, INPUT_AMOUNT);
      if (prices.length < 2) {
        console.log(`❌ Insufficient V2 prices for ${tokenAObj.symbol}-${tokenBObj.symbol}`);
        return null;
      }

      prices.sort((a, b) => a.price - b.price);
      const buyPrice = prices[0].price;
      const sellPrice = prices[prices.length - 1].price;
      const buyDex = prices[0].dex;
      const sellDex = prices[prices.length - 1].dex;
      const amountOut = prices[prices.length - 1].amountOut;
      const buyPool = pairData.pools[buyDex];
      const sellPool = pairData.pools[sellDex];

      const buyFee = pairData.pair.includes(TOKENS.AAVE.address) && pairData.pair.includes(TOKENS.COMP.address) ? SWAP_FEE_AAVE_COMP : SWAP_FEE_V2;
      const sellFee = buyFee;
      const totalFees = buyFee + sellFee;

      const inputAmountNumber = Number(INPUT_AMOUNT) / 10 ** tokenAObj.decimals;
      const outputAmountNumber = Number(amountOut) / 10 ** tokenBObj.decimals;

      const grossProfit = inputAmountNumber * (sellPrice / buyPrice - 1);
      const feeCost = inputAmountNumber * totalFees;
      const gasPrice = await this.provider.getFeeData().then(data => data.gasPrice);
      const gasCostEth = Number(gasPrice * GAS_ESTIMATE_SIMPLE) / 1e18;
      const safetyCost = inputAmountNumber * SAFETY_MARGIN;
      const netProfit = grossProfit - feeCost - gasCostEth - safetyCost;
      const netProfitUsd = netProfit * this.ethPrice;
      const profitPercentage = (netProfit / inputAmountNumber) * 100;

      console.log(`📊 V2 Simple Arbitrage Details:`);
      console.log(`   Buy Token: ${tokenAObj.symbol} (${tokenA})`);
      console.log(`   Sell Token: ${tokenBObj.symbol} (${tokenB})`);
      console.log(`   Buy DEX: ${buyDex} @ ${buyPrice.toFixed(18)} ${tokenBObj.symbol}/${tokenAObj.symbol}`);
      console.log(`   Sell DEX: ${sellDex} @ ${sellPrice.toFixed(18)} ${tokenBObj.symbol}/${tokenAObj.symbol}`);
      console.log(`   Buy Pool: ${buyPool || 'N/A'}`);
      console.log(`   Sell Pool: ${sellPool || 'N/A'}`);
      console.log(`   Input Amount: ${inputAmountNumber.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Output Amount: ${outputAmountNumber.toFixed(tokenBObj.decimals)} ${tokenBObj.symbol}`);
      console.log(`   Platform Fees: ${(totalFees * 100).toFixed(2)}% (${buyFee * 100}% + ${sellFee * 100}%)`);
      console.log(`   Fee Cost: ${feeCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Gas Cost: ${gasCostEth.toFixed(6)} ETH`);
      console.log(`   Safety Margin: ${safetyCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Gross Profit: ${grossProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Net Profit: ${netProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Net Profit USD: $${netProfitUsd.toFixed(2)}`);

      const opportunity = {
        type: 'V2_SIMPLE',
        pair: `${tokenAObj.symbol}-${tokenBObj.symbol}`,
        dex1: buyDex,
        dex1Price: buyPrice,
        dex2: sellDex,
        dex2Price: sellPrice,
        profitEth: netProfit,
        profitUsd: netProfitUsd,
        profitToken: netProfit,
        profitTokenSymbol: tokenAObj.symbol,
        profitPercentage,
        gasEstimate: Number(GAS_ESTIMATE_SIMPLE),
        gasPrice: gasPrice.toString(),
        platformFees: totalFees,
        inputAmount: inputAmountNumber.toFixed(tokenAObj.decimals),
        inputTokenSymbol: tokenAObj.symbol,
        outputAmount: outputAmountNumber.toFixed(tokenBObj.decimals),
        outputTokenSymbol: tokenBObj.symbol,
        profitable: netProfit > 0,
        timestamp: new Date()
      };
     
      if (netProfit > 0) {
        await new Opportunity(opportunity).save();
        this.emit('arbitrage', opportunity);
        console.log(`✅ Profitable V2 Simple Arbitrage Found!`);
      } else {
        console.log(`❌ No profitable V2 Simple Arbitrage for ${tokenAObj.symbol}-${tokenBObj.symbol}`);
      }

      return opportunity;
    } catch (error) {
      console.error(`Error in V2 Simple Arbitrage for ${TOKEN_MAP[pairData.pair[0].toLowerCase()]?.symbol}-${TOKEN_MAP[pairData.pair[1].toLowerCase()]?.symbol}:`, error.message);
      return null;
    }
  }

  async detectV3SimpleArbitrage(pairData) {
    try {
      const [tokenA, tokenB] = pairData.pair;
      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      console.log(`\n🔍 Scanning V3 Simple Arbitrage: ${tokenAObj.symbol}-${tokenBObj.symbol}`);

      const feeTier = pairData.pair.includes(TOKENS.AAVE.address) && pairData.pair.includes(TOKENS.COMP.address) ? FeeAmount.HIGH : PREFERRED_FEE_TIER;
      const prices = await getAllV3Prices(tokenA, tokenB, INPUT_AMOUNT, feeTier);

      if (prices.length < 2) {
        console.log(`❌ Insufficient V3 prices for ${tokenAObj.symbol}-${tokenBObj.symbol}`);
        return null;
      }

      prices.sort((a, b) => a.price - b.price);
      const buyPrice = prices[0].price;
      const sellPrice = prices[prices.length - 1].price;
      const buyDex = prices[0].dex;
      const sellDex = prices[prices.length - 1].dex;
      const amountOut = prices[prices.length - 1].amountOut;
      const buyPool = pairData.pools[buyDex.split('_')[0]]?.find(p => p.fee === feeTier)?.address;
      const sellPool = pairData.pools[sellDex.split('_')[0]]?.find(p => p.fee === feeTier)?.address;

      const buyFee = pairData.pair.includes(TOKENS.AAVE.address) && pairData.pair.includes(TOKENS.COMP.address) ? SWAP_FEE_AAVE_COMP : SWAP_FEE_V3;
      const sellFee = buyFee;
      const totalFees = buyFee + sellFee;

      const inputAmountNumber = Number(INPUT_AMOUNT) / 10 ** tokenAObj.decimals;
      const outputAmountNumber = Number(amountOut) / 10 ** tokenBObj.decimals;

      const grossProfit = inputAmountNumber * (sellPrice / buyPrice - 1);
      const feeCost = inputAmountNumber * totalFees;
      const gasPrice = await this.provider.getFeeData().then(data => data.gasPrice);
      const gasCostEth = Number(gasPrice * GAS_ESTIMATE_SIMPLE) / 1e18;
      const safetyCost = inputAmountNumber * SAFETY_MARGIN;
      const netProfit = grossProfit - feeCost - gasCostEth - safetyCost;
      const netProfitUsd = netProfit * this.ethPrice;
      const profitPercentage = (netProfit / inputAmountNumber) * 100;

      console.log(`📊 V3 Simple Arbitrage Details:`);
      console.log(`   Buy Token: ${tokenAObj.symbol} (${tokenA})`);
      console.log(`   Sell Token: ${tokenBObj.symbol} (${tokenB})`);
      console.log(`   Buy DEX: ${buyDex} @ ${buyPrice.toFixed(18)} ${tokenBObj.symbol}/${tokenAObj.symbol}`);
      console.log(`   Sell DEX: ${sellDex} @ ${sellPrice.toFixed(18)} ${tokenBObj.symbol}/${tokenAObj.symbol}`);
      console.log(`   Buy Pool: ${buyPool || 'N/A'}`);
      console.log(`   Sell Pool: ${sellPool || 'N/A'}`);
      console.log(`   Fee Tier: ${feeTier} (${(feeTier / 10000).toFixed(2)}%)`);
      console.log(`   Input Amount: ${inputAmountNumber.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Output Amount: ${outputAmountNumber.toFixed(tokenBObj.decimals)} ${tokenBObj.symbol}`);
      console.log(`   Platform Fees: ${(totalFees * 100).toFixed(2)}% (${buyFee * 100}% + ${sellFee * 100}%)`);
      console.log(`   Fee Cost: ${feeCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Gas Cost: ${gasCostEth.toFixed(6)} ETH`);
      console.log(`   Safety Margin: ${safetyCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Gross Profit: ${grossProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Net Profit: ${netProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);

      console.log(`   Net Profit USD: $${netProfitUsd.toFixed(2)}`);

      const opportunity = {
        type: 'V3_SIMPLE',
        pair: `${tokenAObj.symbol}-${tokenBObj.symbol}`,
        dex1: buyDex,
        dex1Price: buyPrice,
        dex2: sellDex,
        dex2Price: sellPrice,
        profitEth: netProfit,
        profitUsd: netProfitUsd,
        profitToken: netProfit,
        profitTokenSymbol: tokenAObj.symbol,
        profitPercentage,
        gasEstimate: Number(GAS_ESTIMATE_SIMPLE),
        gasPrice: gasPrice.toString(),
        platformFees: totalFees,
        fee1: feeTier,
        fee2: feeTier,
        inputAmount: inputAmountNumber.toFixed(tokenAObj.decimals),
        inputTokenSymbol: tokenAObj.symbol,
        outputAmount: outputAmountNumber.toFixed(tokenBObj.decimals),
        outputTokenSymbol: tokenBObj.symbol,
        profitable: netProfit > 0,
        timestamp: new Date()
      };

      if (netProfit > 0) {
        await new Opportunity(opportunity).save();
        this.emit('arbitrage', opportunity);
        console.log(`✅ Profitable V3 Simple Arbitrage Found!`);
      } else {
        console.log(`❌ No profitable V3 Simple Arbitrage for ${tokenAObj.symbol}-${tokenBObj.symbol}`);
      }

      return opportunity;
    } catch (error) {
      console.error(`Error in V3 Simple Arbitrage for ${TOKEN_MAP[pairData.pair[0].toLowerCase()]?.symbol}-${TOKEN_MAP[pairData.pair[1].toLowerCase()]?.symbol}:`, error.message);
      return null;
    }
  }

  async detectV2V3CrossArbitrage(pairData) {
    try {
      const [tokenA, tokenB] = pairData.pair;
      const tokenAObj = TOKEN_MAP[tokenA.toLowerCase()];
      const tokenBObj = TOKEN_MAP[tokenB.toLowerCase()];
      console.log(`\n🔍 Scanning V2 vs V3 Cross Arbitrage: ${tokenAObj.symbol}-${tokenBObj.symbol}`);

      const feeTier = pairData.pair.includes(TOKENS.AAVE.address) && pairData.pair.includes(TOKENS.COMP.address) ? FeeAmount.HIGH : PREFERRED_FEE_TIER;
      const v2Prices = await getAllV2Prices(tokenA, tokenB, INPUT_AMOUNT);
      const v3Prices = await getAllV3Prices(tokenA, tokenB, INPUT_AMOUNT, feeTier);

      if (v2Prices.length === 0 || v3Prices.length === 0) {
        console.log(`❌ Insufficient prices for V2 vs V3 cross arbitrage: ${tokenAObj.symbol}-${tokenBObj.symbol}`);
        return null;
      }

      const allPrices = [
        ...v2Prices.map(p => ({ ...p, type: 'V2' })),
        ...v3Prices.map(p => ({ ...p, type: 'V3' }))
      ];
      if (allPrices.length < 2) {
        console.log(`❌ Insufficient prices for cross arbitrage: ${tokenAObj.symbol}-${tokenBObj.symbol}`);
        return null;
      }

      allPrices.sort((a, b) => a.price - b.price);
      const buyPrice = allPrices[0].price;
      const sellPrice = allPrices[allPrices.length - 1].price;
      const buyDex = allPrices[0].dex;
      const sellDex = allPrices[allPrices.length - 1].dex;
      const amountOut = allPrices[allPrices.length - 1].amountOut;
      const buyPool = allPrices[0].type === 'V2' ? pairData.pools[buyDex] : pairData.pools[buyDex.split('_')[0]]?.find(p => p.fee === feeTier)?.address;
      const sellPool = allPrices[allPrices.length - 1].type === 'V2' ? pairData.pools[sellDex] : pairData.pools[sellDex.split('_')[0]]?.find(p => p.fee === feeTier)?.address;

      const buyFee = pairData.pair.includes(TOKENS.AAVE.address) && pairData.pair.includes(TOKENS.COMP.address) ? SWAP_FEE_AAVE_COMP : (allPrices[0].type === 'V2' ? SWAP_FEE_V2 : SWAP_FEE_V3);
      const sellFee = pairData.pair.includes(TOKENS.AAVE.address) && pairData.pair.includes(TOKENS.COMP.address) ? SWAP_FEE_AAVE_COMP : (allPrices[allPrices.length - 1].type === 'V2' ? SWAP_FEE_V2 : SWAP_FEE_V3);
      const totalFees = buyFee + sellFee;

      const inputAmountNumber = Number(INPUT_AMOUNT) / 10 ** tokenAObj.decimals;
      const outputAmountNumber = Number(amountOut) / 10 ** tokenBObj.decimals;

      const grossProfit = inputAmountNumber * (sellPrice / buyPrice - 1);
      const feeCost = inputAmountNumber * totalFees;
      const gasPrice = await this.provider.getFeeData().then(data => data.gasPrice);
      const gasCostEth = Number(gasPrice * GAS_ESTIMATE_SIMPLE) / 1e18;
      const safetyCost = inputAmountNumber * SAFETY_MARGIN;
      const netProfit = grossProfit - feeCost - gasCostEth - safetyCost;
      const netProfitUsd = netProfit * this.ethPrice;
      const profitPercentage = (netProfit / inputAmountNumber) * 100;

      console.log(`📊 V2 vs V3 Cross Arbitrage Details:`);
      console.log(`   Buy Token: ${tokenAObj.symbol} (${tokenA})`);
      console.log(`   Sell Token: ${tokenBObj.symbol} (${tokenB})`);
      console.log(`   Buy DEX: ${buyDex} @ ${buyPrice.toFixed(18)} ${tokenBObj.symbol}/${tokenAObj.symbol}`);
      console.log(`   Sell DEX: ${sellDex} @ ${sellPrice.toFixed(18)} ${tokenBObj.symbol}/${tokenAObj.symbol}`);
      console.log(`   Buy Pool: ${buyPool || 'N/A'}`);
      console.log(`   Sell Pool: ${sellPool || 'N/A'}`);
      console.log(`   Fee Tier (V3): ${feeTier} (${(feeTier / 10000).toFixed(2)}%)`);
      console.log(`   Input Amount: ${inputAmountNumber.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Output Amount: ${outputAmountNumber.toFixed(tokenBObj.decimals)} ${tokenBObj.symbol}`);
      console.log(`   Platform Fees: ${(totalFees * 100).toFixed(2)}% (${buyFee * 100}% + ${sellFee * 100}%)`);
      console.log(`   Fee Cost: ${feeCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Gas Cost: ${gasCostEth.toFixed(6)} ETH`);
      console.log(`   Safety Margin: ${safetyCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Gross Profit: ${grossProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
      console.log(`   Net Profit: ${netProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
  
      console.log(`   Net Profit USD: $${netProfitUsd.toFixed(2)}`);

      const opportunity = {
        type: 'V2_V3_CROSS',
        pair: `${tokenAObj.symbol}-${tokenBObj.symbol}`,
        dex1: buyDex,
        dex1Price: buyPrice,
        dex2: sellDex,
        dex2Price: sellPrice,
        profitEth: netProfit,
        profitUsd: netProfitUsd,
        profitToken: netProfit,
        profitTokenSymbol: tokenAObj.symbol,
        profitPercentage,
        gasEstimate: Number(GAS_ESTIMATE_SIMPLE),
        gasPrice: gasPrice.toString(),
        platformFees: totalFees,
        fee1: allPrices[0].type === 'V3' ? feeTier : 0,
        fee2: allPrices[allPrices.length - 1].type === 'V3' ? feeTier : 0,
        inputAmount: inputAmountNumber.toFixed(tokenAObj.decimals),
        inputTokenSymbol: tokenAObj.symbol,
        outputAmount: outputAmountNumber.toFixed(tokenBObj.decimals),
        outputTokenSymbol: tokenBObj.symbol,
        profitable: netProfit > 0,
        timestamp: new Date()
      };

     
      if (netProfit > 0) {
        await new Opportunity(opportunity).save();
        this.emit('arbitrage', opportunity);
        console.log(`✅ Profitable V2 vs V3 Cross Arbitrage Found!`);
      } else {
        console.log(`❌ No profitable V2 vs V3 Cross Arbitrage for ${tokenAObj.symbol}-${tokenBObj.symbol}`);
      }

      return opportunity;
    } catch (error) {
      console.error(`Error in V2 vs V3 Cross Arbitrage for ${TOKEN_MAP[pairData.pair[0].toLowerCase()]?.symbol}-${TOKEN_MAP[pairData.pair[1].toLowerCase()]?.symbol}:`, error.message);
      return null;
    }
  }

  async detectV2TriangularArbitrage(pathData) {
    try {
      const path = pathData.path;
      const tokenAObj = TOKEN_MAP[path[0].toLowerCase()];
      const tokenBObj = TOKEN_MAP[path[1].toLowerCase()];
      const tokenCObj = TOKEN_MAP[path[2].toLowerCase()];
      console.log(`\n🔍 Scanning V2 Triangular Arbitrage: ${tokenAObj.symbol} -> ${tokenBObj.symbol} -> ${tokenCObj.symbol}`);

      const dexes = [
        { fetcher: uniswapV2Fetcher, name: 'UniswapV2', pools: pathData.pools.map(p => p.UniswapV2).filter(p => p) },
        { fetcher: sushiswapFetcher, name: 'Sushiswap', pools: pathData.pools.map(p => p.Sushiswap).filter(p => p) },
        { fetcher: pancakeswapFetcher, name: 'PancakeSwap', pools: pathData.pools.map(p => p.PancakeSwap).filter(p => p) }
      ].filter(dex => dex.pools.length === pathData.pools.length);

      const opportunities = [];
      for (const dex of dexes) {
        if (dex.pools.every(p => p)) {
          const { amountOut, amounts } = await dex.fetcher.simulateMultiHop(path, INPUT_AMOUNT, dex.pools);
          if (amountOut === 0) continue;

          const inputAmountNumber = Number(INPUT_AMOUNT) / 10 ** tokenAObj.decimals;
          const outputAmountNumber = amountOut;

          const fee = pathData.path.includes(TOKENS.AAVE.address) && pathData.path.includes(TOKENS.COMP.address) ? SWAP_FEE_AAVE_COMP : SWAP_FEE_V2;
          const totalFees = fee * 3; // Three hops

          const grossProfit = outputAmountNumber - inputAmountNumber;
          const feeCost = inputAmountNumber * totalFees;
          const gasPrice = await this.provider.getFeeData().then(data => data.gasPrice);
          const gasCostEth = Number(gasPrice * GAS_ESTIMATE_TRIANGULAR) / 1e18;
          const safetyCost = inputAmountNumber * SAFETY_MARGIN;
          const netProfit = grossProfit - feeCost - gasCostEth - safetyCost;
          const netProfitUsd = netProfit * this.ethPrice;
          const profitPercentage = (netProfit / inputAmountNumber) * 100;

          console.log(`📊 V2 Triangular Arbitrage Details on ${dex.name}:`);
          console.log(`   Path: ${path.map(t => TOKEN_MAP[t.toLowerCase()].symbol).join(' -> ')}`);
          console.log(`   Pool Addresses: ${dex.pools.join(', ')}`);
          console.log(`   Input Amount: ${inputAmountNumber.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          console.log(`   Output Amount: ${outputAmountNumber.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          amounts.slice(1).forEach((amt, i) => {
            const token = TOKEN_MAP[path[i + 1].toLowerCase()];
            console.log(`   Hop ${i + 1}: ${(Number(amt) / 10 ** token.decimals).toFixed(token.decimals)} ${token.symbol}`);
          });
          console.log(`   Platform Fees: ${(totalFees * 100).toFixed(2)}% (${fee * 100}% per hop x 3)`);
          console.log(`   Fee Cost: ${feeCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          console.log(`   Gas Cost: ${gasCostEth.toFixed(6)} ETH`);
          console.log(`   Safety Margin: ${safetyCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          console.log(`   Gross Profit: ${grossProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          console.log(`   Net Profit: ${netProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
        
          console.log(`   Net Profit USD: $${netProfitUsd.toFixed(2)}`);

          const opportunity = {
            type: 'V2_TRIANGULAR',
            pair: `TRI-${tokenAObj.symbol}-${tokenBObj.symbol}-${tokenCObj.symbol}`,
            isTriangular: true,
            triangularPath: path.map(t => TOKEN_MAP[t.toLowerCase()].symbol),
            triangularDex: dex.name,
            profitEth: netProfit,
            profitUsd: netProfitUsd,
            profitToken: netProfit,
            profitTokenSymbol: tokenAObj.symbol,
            profitPercentage,
            gasEstimate: Number(GAS_ESTIMATE_TRIANGULAR),
            gasPrice: gasPrice.toString(),
            platformFees: totalFees,
            inputAmount: inputAmountNumber.toFixed(tokenAObj.decimals),
            inputTokenSymbol: tokenAObj.symbol,
            outputAmount: outputAmountNumber.toFixed(tokenAObj.decimals),
            outputTokenSymbol: tokenAObj.symbol,
            profitable: netProfit > 0,
            timestamp: new Date()
          };

          if (netProfit > 0) {
            await new Opportunity(opportunity).save();
            this.emit('arbitrage', opportunity);
            console.log(`✅ Profitable V2 Triangular Arbitrage Found on ${dex.name}!`);
          } else {
            console.log(`❌ No profitable V2 Triangular Arbitrage on ${dex.name}`);
          }

          opportunities.push(opportunity);
        }
      }

      return opportunities.length > 0 ? opportunities : null;
    } catch (error) {
      console.error(`Error in V2 Triangular Arbitrage for path ${pathData.path.map(t => TOKEN_MAP[t.toLowerCase()]?.symbol).join('->')}:`, error.message);
      return null;
    }
  }

  async detectV3TriangularArbitrage(pathData) {
    try {
      const path = pathData.path;
      const tokenAObj = TOKEN_MAP[path[0].toLowerCase()];
      const tokenBObj = TOKEN_MAP[path[1].toLowerCase()];
      const tokenCObj = TOKEN_MAP[path[2].toLowerCase()];
      console.log(`\n🔍 Scanning V3 Triangular Arbitrage: ${tokenAObj.symbol} -> ${tokenBObj.symbol} -> ${tokenCObj.symbol}`);

      const fee = pathData.path.includes(TOKENS.AAVE.address) && pathData.path.includes(TOKENS.COMP.address) ? FeeAmount.HIGH : PREFERRED_FEE_TIER;
      const dexes = [
        { fetcher: uniswapV3Fetcher, name: 'UniswapV3', pools: pathData.pools.map(p => p.UniswapV3).filter(p => p) },
        { fetcher: sushiswapV3Fetcher, name: 'SushiswapV3', pools: pathData.pools.map(p => p.SushiswapV3).filter(p => p) },
        { fetcher: pancakeswapV3Fetcher, name: 'PancakeSwapV3', pools: pathData.pools.map(p => p.PancakeSwapV3).filter(p => p) }
      ].filter(dex => dex.pools.length === pathData.pools.length);

      const opportunities = [];
      for (const dex of dexes) {
        if (dex.pools.every(p => p)) {
          const fees = Array(path.length - 1).fill(fee);
          const { amountOut, amounts } = await dex.fetcher.simulateMultiHop(path, fees, INPUT_AMOUNT, dex.pools);
          if (amountOut === 0) continue;

          const inputAmountNumber = Number(INPUT_AMOUNT) / 10 ** tokenAObj.decimals;
          const outputAmountNumber = amountOut;

          const swapFee = pathData.path.includes(TOKENS.AAVE.address) && pathData.path.includes(TOKENS.COMP.address) ? SWAP_FEE_AAVE_COMP : SWAP_FEE_V3;
          const totalFees = swapFee * 3; // Three hops

          const grossProfit = outputAmountNumber - inputAmountNumber;
          const feeCost = inputAmountNumber * totalFees;
          const gasPrice = await this.provider.getFeeData().then(data => data.gasPrice);
          const gasCostEth = Number(gasPrice * GAS_ESTIMATE_TRIANGULAR) / 1e18;
          const safetyCost = inputAmountNumber * SAFETY_MARGIN;
          const netProfit = grossProfit - feeCost - gasCostEth - safetyCost;
          const netProfitUsd = netProfit * this.ethPrice;
          const profitPercentage = (netProfit / inputAmountNumber) * 100;

          console.log(`📊 V3 Triangular Arbitrage Details on ${dex.name}:`);
          console.log(`   Path: ${path.map(t => TOKEN_MAP[t.toLowerCase()].symbol).join(' -> ')}`);
          console.log(`   Pool Addresses: ${dex.pools.join(', ')}`);
          console.log(`   Fee Tiers: ${fees.map(f => `${f} (${(f / 10000).toFixed(2)}%)`).join(', ')}`);
          console.log(`   Input Amount: ${inputAmountNumber.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          console.log(`   Output Amount: ${outputAmountNumber.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          amounts.slice(1).forEach((amt, i) => {
            const token = TOKEN_MAP[path[i + 1].toLowerCase()];
            console.log(`   Hop ${i + 1}: ${(Number(amt) / 10 ** token.decimals).toFixed(token.decimals)} ${token.symbol}`);
          });
          console.log(`   Platform Fees: ${(totalFees * 100).toFixed(2)}% (${swapFee * 100}% per hop x 3)`);
          console.log(`   Fee Cost: ${feeCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          console.log(`   Gas Cost: ${gasCostEth.toFixed(6)} ETH`);
          console.log(`   Safety Margin: ${safetyCost.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          console.log(`   Gross Profit: ${grossProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
          console.log(`   Net Profit: ${netProfit.toFixed(tokenAObj.decimals)} ${tokenAObj.symbol}`);
     
          console.log(`   Net Profit USD: $${netProfitUsd.toFixed(2)}`);

          const opportunity = {
            type: 'V3_TRIANGULAR',
            pair: `TRI-${tokenAObj.symbol}-${tokenBObj.symbol}-${tokenCObj.symbol}`,
            isTriangular: true,
            triangularPath: path.map(t => TOKEN_MAP[t.toLowerCase()].symbol),
            triangularDex: dex.name,
            profitEth: netProfit,
            profitUsd: netProfitUsd,
            profitToken: netProfit,
            profitTokenSymbol: tokenAObj.symbol,
            profitPercentage,
            gasEstimate: Number(GAS_ESTIMATE_TRIANGULAR),
            gasPrice: gasPrice.toString(),
            platformFees: totalFees,
            fee1: fee,
            inputAmount: inputAmountNumber.toFixed(tokenAObj.decimals),
            inputTokenSymbol: tokenAObj.symbol,
            outputAmount: outputAmountNumber.toFixed(tokenAObj.decimals),
            outputTokenSymbol: tokenAObj.symbol,
            profitable: netProfit > 0,
            timestamp: new Date()
          };

         await new Opportunity(opportunity).save();
          if (netProfit > 0) {
            this.emit('arbitrage', opportunity);
            console.log(`✅ Profitable V3 Triangular Arbitrage Found on ${dex.name}!`);
          } else {
            console.log(`❌ No profitable V3 Triangular Arbitrage on ${dex.name}`);
          }

          opportunities.push(opportunity);
        }
      }

      return opportunities.length > 0 ? opportunities : null;
    } catch (error) {
      console.error(`Error in V3 Triangular Arbitrage for path ${pathData.path.map(t => TOKEN_MAP[t.toLowerCase()]?.symbol).join('->')}:`, error.message);
      return null;
    }
  }

  async scanAllOpportunities() {
    try {
      console.log(`\n🚀 Starting Arbitrage Scan at ${new Date().toISOString()}`);
      await this.updateEthPrice();

      const opportunities = [];

      // V2 Simple Arbitrage
      for (const pair of VALID_TRADING_PAIRS) {
        const opp = await this.detectV2SimpleArbitrage(pair);
        if (opp) opportunities.push(opp);
      }

      // V3 Simple Arbitrage
      for (const pair of VALID_TRADING_PAIRS) {
        const opp = await this.detectV3SimpleArbitrage(pair);
        if (opp) opportunities.push(opp);
      }

      // V2 vs V3 Cross Arbitrage
      for (const pair of VALID_TRADING_PAIRS) {
        const opp = await this.detectV2V3CrossArbitrage(pair);
        if (opp) opportunities.push(opp);
      }

      // V2 Triangular Arbitrage
      for (const path of VALID_TRIANGULAR_PATHS) {
        const opps = await this.detectV2TriangularArbitrage(path);
        if (opps) opportunities.push(...opps);
      }

      // V3 Triangular Arbitrage
      for (const path of VALID_TRIANGULAR_PATHS) {
        const opps = await this.detectV3TriangularArbitrage(path);
        if (opps) opportunities.push(...opps);
      }

      console.log(`🏁 Arbitrage Scan Completed. Found ${opportunities.length} opportunities (${opportunities.filter(o => o.profitable).length} profitable)`);
      return opportunities;
    } catch (error) {
      console.error('Error in scanAllOpportunities:', error.message);
      return [];
    }
  }
}

export default ArbitrageDetector;