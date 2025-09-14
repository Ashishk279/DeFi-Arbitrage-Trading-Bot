import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import wsProvider from '../providers/websocketProvider.js';
import { getAllV2Prices } from '../fetchers/priceFetcherV2.js';
import { getAllV3Prices, getBestV3Price, FeeAmount } from '../fetchers/priceFetcherV3.js';
import { uniswapV2Fetcher, sushiswapFetcher, pancakeswapFetcher } from '../fetchers/priceFetcherV2.js';
import { uniswapV3Fetcher } from '../fetchers/priceFetcherV3.js';
import { VALID_TRADING_PAIRS, VALID_TRIANGULAR_PATHS, TOKEN_MAP } from '../config/tokens.js';

const SWAP_FEE_V2 = 0.003;
const SWAP_FEE_V3 = 0.003;
const SAFETY_MARGIN = 0.001;
const GAS_ESTIMATE_SIMPLE = 200000n;
const GAS_ESTIMATE_TRIANGULAR = 300000n;
const INPUT_AMOUNT = ethers.parseEther('0.01');
const PREFERRED_FEE_TIER = FeeAmount.MEDIUM; // 0.3% fee tier (3000)

class ArbitrageDetector extends EventEmitter {
  constructor() {
    super();
    this.provider = wsProvider.getProvider();
    this.ethPrice = 2500;
    this.listeners = {};
  }

  async updateEthPrice() {
    try {
      this.ethPrice = 2500; // Placeholder; replace with actual price feed
    } catch (error) {
      console.error('Error updating ETH price:', error.message);
    }
  }

  async detectV2SimpleArbitrage(pairData) {
    try {
      const [tokenA, tokenB] = pairData.pair;
      console.log(`\n🔍 Scanning V2 Simple Arbitrage: ${tokenA.slice(0, 6)}-${tokenB.slice(0, 6)}`);

      const prices = await getAllV2Prices(tokenA, tokenB, INPUT_AMOUNT);

      if (prices.length < 2) {
        console.log('❌ Insufficient V2 prices for arbitrage');
        return null;
      }

      prices.sort((a, b) => a.price - b.price);
      const buyPrice = prices[0].price;
      const sellPrice = prices[prices.length - 1].price;
      const buyDex = prices[0].dex;
      const sellDex = prices[prices.length - 1].dex;

      if (buyPrice >= sellPrice || buyPrice === 0) {
        console.log('❌ No profitable V2 price difference');
        return null;
      }

      const opportunity = await this.calculateProfitability({
        buyPrice,
        sellPrice,
        buyDex,
        sellDex,
        inputAmount: INPUT_AMOUNT,
        swapFee: SWAP_FEE_V2,
        gasEstimate: GAS_ESTIMATE_SIMPLE,
        type: 'V2_SIMPLE',
        pair: `${tokenA.slice(0, 6)}-${tokenB.slice(0, 6)}`
      });

      return opportunity;
    } catch (error) {
      console.error('Error in V2 simple arbitrage detection:', error.message);
      return null;
    }
  }

  async detectV3SimpleArbitrage(pairData) {
    try {
      const [tokenA, tokenB] = pairData.pair;
      console.log(`\n🔍 Scanning V3 Simple Arbitrage: ${tokenA.slice(0, 6)}-${tokenB.slice(0, 6)}`);

      const prices = await getAllV3Prices(tokenA, tokenB, INPUT_AMOUNT, PREFERRED_FEE_TIER);

      if (prices.length === 0) {
        console.log('❌ No valid V3 prices for arbitrage');
        return null;
      }

      // Since we're using a single fee tier, simple arbitrage within Uniswap V3 doesn't apply
      console.log('❌ V3 simple arbitrage not applicable within same fee tier');
      return null;
    } catch (error) {
      console.error('Error in V3 simple arbitrage detection:', error.message);
      return null;
    }
  }

  async detectV2V3CrossArbitrage(pairData) {
    try {
      const [tokenA, tokenB] = pairData.pair;
      console.log(`\n🔍 Scanning V2 vs V3 Cross Arbitrage: ${tokenA.slice(0, 6)}-${tokenB.slice(0, 6)}`);

      const v2Prices = await getAllV2Prices(tokenA, tokenB, INPUT_AMOUNT);
      const bestV3 = await getBestV3Price(tokenA, tokenB, INPUT_AMOUNT, PREFERRED_FEE_TIER);

      if (v2Prices.length === 0 || bestV3.price === 0) {
        console.log('❌ Insufficient prices for V2 vs V3 arbitrage');
        return null;
      }

      const allPrices = [...v2Prices, { dex: `UniswapV3_${bestV3.fee}`, price: bestV3.price, fee: bestV3.fee }];

      allPrices.sort((a, b) => a.price - b.price);
      const buyPrice = allPrices[0].price;
      const sellPrice = allPrices[allPrices.length - 1].price;
      const buyDex = allPrices[0].dex;
      const sellDex = allPrices[allPrices.length - 1].dex;

      if (buyPrice >= sellPrice || buyPrice === 0) {
        console.log('❌ No profitable V2 vs V3 price difference');
        return null;
      }

      const opportunity = await this.calculateProfitability({
        buyPrice,
        sellPrice,
        buyDex,
        sellDex,
        inputAmount: INPUT_AMOUNT,
        swapFee: SWAP_FEE_V2,
        gasEstimate: GAS_ESTIMATE_SIMPLE,
        type: 'V2_V3_CROSS',
        pair: `${tokenA.slice(0, 6)}-${tokenB.slice(0, 6)}`,
        fee1: allPrices[0].fee || 3000,
        fee2: allPrices[allPrices.length - 1].fee || 3000
      });

      return opportunity;
    } catch (error) {
      console.error('Error in V2 vs V3 cross arbitrage detection:', error.message);
      return null;
    }
  }

  async detectV2TriangularArbitrage(pathData) {
    try {
      const path = pathData.path;
      console.log(`\n🔺 Scanning V2 Triangular Arbitrage: ${path.map(t => t.slice(0, 6)).join('->')}`);

      const opportunities = [];
      const fetchers = [
        { fetcher: uniswapV2Fetcher, name: 'UniswapV2' },
        { fetcher: sushiswapFetcher, name: 'Sushiswap' },
        { fetcher: pancakeswapFetcher, name: 'PancakeSwap' }
      ];

      for (const { fetcher, name } of fetchers) {
        try {
          const pairAddresses = pathData.pools.map(p => p[name]);
          if (pairAddresses.some(addr => !addr)) {
            console.log(`❌ ${name}: Missing pair address for path ${path.map(t => t.slice(0, 6)).join('->')}`);
            continue;
          }

          const amountOut = await fetcher.simulateMultiHop(path, INPUT_AMOUNT, pairAddresses);

          if (amountOut === 0) {
            console.log(`❌ ${name}: Zero amount out`);
            continue;
          }

          const reversePath = [...path].reverse();
          const reversePairAddresses = [...pairAddresses].reverse();
          const outputToken = TOKEN_MAP[path[path.length - 1].toLowerCase()];
          const decOut = outputToken?.decimals || 18;
          const amountForReverse = ethers.parseUnits(amountOut.toString(), decOut);

          const amountBack = await fetcher.simulateMultiHop(reversePath, amountForReverse, reversePairAddresses);

          if (amountBack === 0) {
            console.log(`❌ ${name}: Zero amount back`);
            continue;
          }

          const inputAmountNumber = Number(INPUT_AMOUNT) / 1e18;
          const grossProfitEth = amountBack - inputAmountNumber;

          if (grossProfitEth <= 0) {
            console.log(`❌ ${name}: No gross profit`);
            continue;
          }

          console.log("Full Info: " , {
            "path": path,
            "reversePath": reversePath,
            "reversePairAddresses": reversePairAddresses,
            "amountOut": amountOut,
            "outputToken": outputToken,
            "decimalOut": decOut,
            "amountForReverse": amountForReverse,
            "amountBack": amountBack,
            "inputAmountNumber": inputAmountNumber,
            "grpssProfitEth": grossProfitEth


          })

          const opportunity = await this.calculateTriangularProfitability({
            grossProfitEth,
            inputAmount: INPUT_AMOUNT,
            swapFee: SWAP_FEE_V2,
            gasEstimate: GAS_ESTIMATE_TRIANGULAR,
            type: 'V2_TRIANGULAR',
            dex: name,
            path: path.map(t => t.slice(0, 6)),
            amountOut,
            amountBack
          });

          if (opportunity) {
            opportunities.push(opportunity);
          }
        } catch (error) {
          console.error(`Error in ${name} triangular arbitrage:`, error.message);
        }
      }

      return opportunities.length > 0 ? opportunities.reduce((best, current) =>
        current.profitEth > best.profitEth ? current : best
      ) : null;
    } catch (error) {
      console.error('Error in V2 triangular arbitrage detection:', error.message);
      return null;
    }
  }

  async detectV3TriangularArbitrage(pathData) {
    try {
      const path = pathData.path;
      console.log(`\n🔺 Scanning V3 Triangular Arbitrage: ${path.map(t => t.slice(0, 6)).join('->')}`);

      const fees = Array(path.length - 1).fill(PREFERRED_FEE_TIER);
      const pairAddresses = pathData.pools.map(p => p.UniswapV3);
      if (pairAddresses.some(addr => !addr)) {
        console.log(`❌ UniswapV3: Missing pool address for path ${path.map(t => t.slice(0, 6)).join('->')}`);
        return null;
      }

      const amountOut = await uniswapV3Fetcher.simulateMultiHop(path, fees, INPUT_AMOUNT, pairAddresses);

      if (amountOut === 0) {
        console.log('❌ V3: Zero amount out');
        return null;
      }

      const reversePath = [...path].reverse();
      const reverseFees = [...fees].reverse();
      const reversePairAddresses = [...pairAddresses].reverse();
      const outputToken = TOKEN_MAP[path[path.length - 1].toLowerCase()];
      const decOut = outputToken?.decimals || 18;
      const amountForReverse = ethers.parseUnits(amountOut.toString(), decOut);

      const amountBack = await uniswapV3Fetcher.simulateMultiHop(reversePath, reverseFees, amountForReverse, reversePairAddresses);

      if (amountBack === 0) {
        console.log('❌ V3: Zero amount back');
        return null;
      }

      const inputAmountNumber = Number(INPUT_AMOUNT) / 1e18;
      const grossProfitEth = amountBack - inputAmountNumber;

      if (grossProfitEth <= 0) {
        console.log('❌ V3: No gross profit');
        return null;
      }
      
      console.log("Full Info: " , {
            "path": path,
            "reversePath": reversePath,
            "reversePairAddresses": reversePairAddresses,
            "fees": fees,
            "reverseFees": reverseFees,
            "amountOut": amountOut,
            "outputToken": outputToken,
            "decimalOut": decOut,
            "amountForReverse": amountForReverse,
            "amountBack": amountBack,
            "inputAmountNumber": inputAmountNumber,
            "grpssProfitEth": grossProfitEth


          })
      const opportunity = await this.calculateTriangularProfitability({
        grossProfitEth,
        inputAmount: INPUT_AMOUNT,
        swapFee: SWAP_FEE_V3,
        gasEstimate: GAS_ESTIMATE_TRIANGULAR,
        type: 'V3_TRIANGULAR',
        dex: 'UniswapV3',
        path: path.map(t => t.slice(0, 6)),
        amountOut,
        amountBack,
        fees
      });

      return opportunity;
    } catch (error) {
      console.error('Error in V3 triangular arbitrage detection:', error.message);
      return null;
    }
  }

  async calculateProfitability({
    buyPrice,
    sellPrice,
    buyDex,
    sellDex,
    inputAmount,
    swapFee,
    gasEstimate,
    type,
    pair,
    fee1 = 0,
    fee2 = 0
  }) {
    try {

      console.log()
      const inputAmountNumber = Number(inputAmount) / 1e18;
      const grossMultiplier = sellPrice / buyPrice;
      const grossProfitEth = inputAmountNumber * (grossMultiplier - 1);

      if (grossProfitEth <= 0) {
        console.log('❌ No gross profit');
        return null;
      }

      const swapFeesEth = inputAmountNumber * swapFee * 2;
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
      const gasEth = Number(gasPrice * gasEstimate) / 1e18;

      const totalCostsEth = swapFeesEth + gasEth;
      const netProfitEth = grossProfitEth - totalCostsEth - (inputAmountNumber * SAFETY_MARGIN);
      const netProfitUsd = netProfitEth * this.ethPrice;

      if (netProfitEth <= 0) {
        console.log(`❌ No net profit after costs. Gross: ${grossProfitEth.toFixed(6)} ETH, Costs: ${totalCostsEth.toFixed(6)} ETH`);
        return null;
      }


      console.log("Full Information: ", {
        "BuyPrice": buyPrice,
        "SellPrice": sellPrice,
        "BuyDex": buyDex,
        "SellDex": sellDex,
        "inputAmount": inputAmount,
        "swapFee": swapFee,
        "gasEstimate": gasEstimate,
        "type": type,
        "pair": pair,
        "fee1": fee1,
        "fee2": fee2,
        "inputAmountNumber": inputAmountNumber,
        "feeData": feeData,
        "gasPrice": gasPrice,
        "gasEth": gasEth,
        "grossMultiplier": grossMultiplier,
        "grossProfitEth": grossProfitEth,
        "totalCostEth": totalCostsEth,
        "netProfitEth": netProfitEth,
        "netProfitUSD": netProfitUsd

      })

      console.log(`✅ Profitable ${type} opportunity found!`);
      console.log(`   Profit: ${netProfitEth.toFixed(6)} ETH ($${netProfitUsd.toFixed(2)})`);
      console.log(`   Buy: ${buyDex} @ ${buyPrice.toFixed(6)}`);
      console.log(`   Sell: ${sellDex} @ ${sellPrice.toFixed(6)}`);

      return {
        type,
        pair,
        dex1: buyDex,
        dex1Price: buyPrice,
        dex2: sellDex,
        dex2Price: sellPrice,
        profitEth: netProfitEth,
        profitUsd: netProfitUsd,
        gasEstimate: Number(gasEstimate),
        gasPrice: gasPrice.toString(),
        inputAmount: inputAmount.toString(),
        isTriangular: false,
        fee1,
        fee2
      };
    } catch (error) {
      console.error('Error calculating profitability:', error.message);
      return null;
    }
  }

  async calculateTriangularProfitability({
    grossProfitEth,
    inputAmount,
    swapFee,
    gasEstimate,
    type,
    dex,
    path,
    amountOut,
    amountBack,
    fees = []
  }) {
    try {
      const inputAmountNumber = Number(inputAmount) / 1e18;
      const swapFeesEth = inputAmountNumber * swapFee * 3;
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
      const gasEth = Number(gasPrice * gasEstimate) / 1e18;

      const totalCostsEth = swapFeesEth + gasEth;
      const netProfitEth = grossProfitEth - totalCostsEth - (inputAmountNumber * SAFETY_MARGIN);
      const netProfitUsd = netProfitEth * this.ethPrice;

      if (netProfitEth <= 0) {
        console.log(`❌ No net triangular profit after costs. Gross: ${grossProfitEth.toFixed(6)} ETH, Costs: ${totalCostsEth.toFixed(6)} ETH`);
        return null;
      }

       console.log("Full Information: ", {
       "path": path,
       "amountOut": amountOut,
       "amountBack": amountBack,
        "inputAmount": inputAmount,
        "swapFee": swapFee,
        "swapFeeEth": swapFeesEth,
        "gasEstimate": gasEstimate,
        "type": type,
        "dex": dex,
        "fees": fees,
        "inputAmountNumber": inputAmountNumber,
        "feeData": feeData,
        "gasPrice": gasPrice,
        "gasEth": gasEth,
        "grossMultiplier": grossMultiplier,
        "grossProfitEth": grossProfitEth,
        "totalCostEth": totalCostsEth,
        "netProfitEth": netProfitEth,
        "netProfitUSD": netProfitUsd

      })

      console.log(`✅ Profitable ${type} triangular opportunity found!`);
      console.log(`   Profit: ${netProfitEth.toFixed(6)} ETH ($${netProfitUsd.toFixed(2)})`);
      console.log(`   Path: ${path.join('->')}`);
      console.log(`   DEX: ${dex}`);

      return {
        type,
        pair: `TRI-${path.join('-')}`,
        triangularDex: dex,
        triangularPath: path,
        profitEth: netProfitEth,
        profitUsd: netProfitUsd,
        gasEstimate: Number(gasEstimate),
        gasPrice: gasPrice.toString(),
        inputAmount: inputAmount.toString(),
        outputAmount: amountOut.toString(),
        amountBack: amountBack.toString(),
        isTriangular: true,
        fees: fees || []
      };
    } catch (error) {
      console.error('Error calculating triangular profitability:', error.message);
      return null;
    }
  }

  async scanAllOpportunities() {
    await this.updateEthPrice();
    const opportunities = [];
    const currentBlock = await this.provider.getBlockNumber();

    console.log(`\n🚀 Starting arbitrage scan at block ${currentBlock}`);
    console.log(`📊 Scanning ${VALID_TRADING_PAIRS.length} pairs and ${VALID_TRIANGULAR_PATHS.length} triangular paths`);

    try {
      // Sequential processing of simple arbitrage opportunities
      for (const pairData of VALID_TRADING_PAIRS) {
        const v2Result = await this.detectV2SimpleArbitrage(pairData);
        if (v2Result) {
          opportunities.push({ ...v2Result, blockNumber: currentBlock });
        }

        const v3Result = await this.detectV3SimpleArbitrage(pairData);
        if (v3Result) {
          opportunities.push({ ...v3Result, blockNumber: currentBlock });
        }

        const v2v3Result = await this.detectV2V3CrossArbitrage(pairData);
        if (v2v3Result) {
          opportunities.push({ ...v2v3Result, blockNumber: currentBlock });
        }
      }

      // Sequential processing of triangular arbitrage opportunities
      for (const pathData of VALID_TRIANGULAR_PATHS) {
        const v2TriangularResult = await this.detectV2TriangularArbitrage(pathData);
        if (v2TriangularResult) {
          opportunities.push({ ...v2TriangularResult, blockNumber: currentBlock });
        }

        const v3TriangularResult = await this.detectV3TriangularArbitrage(pathData);
        if (v3TriangularResult) {
          opportunities.push({ ...v3TriangularResult, blockNumber: currentBlock });
        }
      }

      opportunities.sort((a, b) => b.profitEth - a.profitEth);

      console.log(`\n📈 Scan complete! Found ${opportunities.length} opportunities`);

      if (opportunities.length > 0) {
        console.log('\n🏆 Top 5 opportunities:');
        opportunities.slice(0, 5).forEach((opp, index) => {
          console.log(`${index + 1}. ${opp.type} - ${opp.pair}: ${opp.profitEth.toFixed(6)} ETH ($${opp.profitUsd?.toFixed(2) || '0'})`);
        });
      }

      return opportunities;
    } catch (error) {
      console.error('Error in scanAllOpportunities:', error.message);
      return opportunities;
    }
  }

  startRealTimeMonitoring() {
    console.log('🔄 Starting real-time arbitrage monitoring...');

    wsProvider.subscribeToBlocks(async (blockNumber) => {
      console.log(`\n🆕 New block ${blockNumber} - scanning for opportunities...`);

      try {
        const opportunities = await this.scanAllOpportunities();

        if (opportunities.length > 0) {
          console.log(`⚡ Found ${opportunities.length} real-time opportunities in block ${blockNumber}`);
          this.emit('opportunities', opportunities);
        }
      } catch (error) {
        console.error(`Error scanning block ${blockNumber}:`, error.message);
      }
    });

    wsProvider.subscribeToPendingTxs((txHash) => {
      console.log(`📋 Pending tx: ${txHash}`);
    });
  }

  stopRealTimeMonitoring() {
    console.log('🛑 Stopping real-time arbitrage monitoring...');
    wsProvider.unsubscribeFromBlocks();
    wsProvider.unsubscribeFromPendingTxs();
  }

  getStats(opportunities) {
    if (!opportunities || opportunities.length === 0) {
      return {
        total: 0,
        profitable: 0,
        totalProfitEth: 0,
        totalProfitUsd: 0,
        averageProfitEth: 0,
        types: {}
      };
    }

    const stats = {
      total: opportunities.length,
      profitable: opportunities.filter(opp => opp.profitEth > 0).length,
      totalProfitEth: opportunities.reduce((sum, opp) => sum + opp.profitEth, 0),
      totalProfitUsd: opportunities.reduce((sum, opp) => sum + (opp.profitUsd || 0), 0),
      averageProfitEth: 0,
      types: {}
    };

    // Calculate average profit for profitable opportunities
    if (stats.profitable > 0) {
      stats.averageProfitEth = stats.totalProfitEth / stats.profitable;
    }

    // Group by opportunity type
    opportunities.forEach(opp => {
      const type = opp.type;
      if (!stats.types[type]) {
        stats.types[type] = {
          count: 0,
          totalProfitEth: 0,
          totalProfitUsd: 0,
          pairs: new Set()
        };
      }
      stats.types[type].count += 1;
      stats.types[type].totalProfitEth += opp.profitEth;
      stats.types[type].totalProfitUsd += opp.profitUsd || 0;
      stats.types[type].pairs.add(opp.pair);
    });

    // Calculate average profit per type
    Object.keys(stats.types).forEach(type => {
      stats.types[type].averageProfitEth = stats.types[type].count > 0
        ? stats.types[type].totalProfitEth / stats.types[type].count
        : 0;
      stats.types[type].pairs = Array.from(stats.types[type].pairs);
    });

    console.log('\n📊 Arbitrage Statistics:');
    console.log(`Total Opportunities: ${stats.total}`);
    console.log(`Profitable Opportunities: ${stats.profitable}`);
    console.log(`Total Profit: ${stats.totalProfitEth.toFixed(6)} ETH ($${stats.totalProfitUsd.toFixed(2)})`);
    console.log(`Average Profit: ${stats.averageProfitEth.toFixed(6)} ETH`);
    console.log('Breakdown by Type:');
    Object.keys(stats.types).forEach(type => {
      console.log(`  ${type}:`);
      console.log(`    Count: ${stats.types[type].count}`);
      console.log(`    Total Profit: ${stats.types[type].totalProfitEth.toFixed(6)} ETH ($${stats.types[type].totalProfitUsd.toFixed(2)})`);
      console.log(`    Average Profit: ${stats.types[type].averageProfitEth.toFixed(6)} ETH`);
      console.log(`    Pairs: ${stats.types[type].pairs.join(', ')}`);
    });

    return stats;
  }
}

export default ArbitrageDetector;