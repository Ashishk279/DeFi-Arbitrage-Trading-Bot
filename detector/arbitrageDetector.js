import { ethers } from 'ethers';
import wsProvider from '../providers/websocketProvider.js';
import { getAllV2Prices } from '../fetchers/priceFetcherV2.js';
import { getAllV3Prices, getBestV3Price, FEE_TIERS } from '../fetchers/priceFetcherV3.js';
import { uniswapV2Fetcher, sushiswapFetcher } from '../fetchers/priceFetcherV2.js';
import { uniswapV3Fetcher } from '../fetchers/priceFetcherV3.js';
import { TRADING_PAIRS, TRIANGULAR_PATHS, TOKEN_MAP } from '../config/tokens.js';

const SWAP_FEE_V2 = 0.003; // 0.3%
const SWAP_FEE_V3 = 0.003; // Approximate 0.3%
const SAFETY_MARGIN = 0.001; // 0.1%
const GAS_ESTIMATE_SIMPLE = 200000n;
const GAS_ESTIMATE_TRIANGULAR = 300000n;
const INPUT_AMOUNT = ethers.parseEther('0.01'); // 0.01 ETH equivalent

class ArbitrageDetector {
  constructor() {
    this.provider = wsProvider.getProvider();
    this.ethPrice = 2500; // USD - should be fetched from oracle
    this.listeners = {};
  }

  async updateEthPrice() {
    // In production, fetch from price oracle or API
    // For now, using static value
    try {
      // You could integrate with Chainlink oracle here
      this.ethPrice = 2500; // Placeholder
    } catch (error) {
      console.error('Error updating ETH price:', error.message);
    }
  }

  // V2 Simple Arbitrage Detection
  async detectV2SimpleArbitrage(pair) {
    try {
      const [tokenA, tokenB] = pair;
      console.log(`\n🔍 Scanning V2 Simple Arbitrage: ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}`);
      
      const prices = await getAllV2Prices(tokenA, tokenB, INPUT_AMOUNT);
      
      if (prices.length < 2) {
        console.log('❌ Insufficient V2 prices for arbitrage');
        return null;
      }

      // Sort by price to find buy low, sell high
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
        pair: `${tokenA.slice(0,6)}-${tokenB.slice(0,6)}`
      });

      return opportunity;
    } catch (error) {
      console.error('Error in V2 simple arbitrage detection:', error.message);
      return null;
    }
  }

  // V3 Simple Arbitrage Detection
  async detectV3SimpleArbitrage(pair) {
    try {
      const [tokenA, tokenB] = pair;
      console.log(`\n🔍 Scanning V3 Simple Arbitrage: ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}`);
      
      const prices = await getAllV3Prices(tokenA, tokenB, INPUT_AMOUNT);
      
      if (prices.length < 2) {
        console.log('❌ Insufficient V3 prices for arbitrage');
        return null;
      }

      // Sort by price to find buy low, sell high
      prices.sort((a, b) => a.price - b.price);
      const buyPrice = prices[0].price;
      const sellPrice = prices[prices.length - 1].price;
      const buyDex = prices[0].dex;
      const sellDex = prices[prices.length - 1].dex;

      if (buyPrice >= sellPrice || buyPrice === 0) {
        console.log('❌ No profitable V3 price difference');
        return null;
      }

      const opportunity = await this.calculateProfitability({
        buyPrice,
        sellPrice,
        buyDex,
        sellDex,
        inputAmount: INPUT_AMOUNT,
        swapFee: SWAP_FEE_V3,
        gasEstimate: GAS_ESTIMATE_SIMPLE,
        type: 'V3_SIMPLE',
        pair: `${tokenA.slice(0,6)}-${tokenB.slice(0,6)}`,
        fee1: prices[0].fee,
        fee2: prices[prices.length - 1].fee
      });

      return opportunity;
    } catch (error) {
      console.error('Error in V3 simple arbitrage detection:', error.message);
      return null;
    }
  }

  // V2 vs V3 Cross-Protocol Arbitrage
  async detectV2V3CrossArbitrage(pair) {
    try {
      const [tokenA, tokenB] = pair;
      console.log(`\n🔍 Scanning V2 vs V3 Cross Arbitrage: ${tokenA.slice(0,6)}-${tokenB.slice(0,6)}`);
      
      const [v2Prices, bestV3] = await Promise.all([
        getAllV2Prices(tokenA, tokenB, INPUT_AMOUNT),
        getBestV3Price(tokenA, tokenB, INPUT_AMOUNT)
      ]);

      if (v2Prices.length === 0 || bestV3.price === 0) {
        console.log('❌ Insufficient prices for V2 vs V3 arbitrage');
        return null;
      }

      // Add V3 price to comparison
      const allPrices = [...v2Prices, { dex: `UniswapV3_${bestV3.fee}`, price: bestV3.price, fee: bestV3.fee }];
      
      // Sort by price to find arbitrage opportunity
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
        swapFee: SWAP_FEE_V2, // Use average fee
        gasEstimate: GAS_ESTIMATE_SIMPLE,
        type: 'V2_V3_CROSS',
        pair: `${tokenA.slice(0,6)}-${tokenB.slice(0,6)}`,
        fee1: allPrices[0].fee || 3000,
        fee2: allPrices[allPrices.length - 1].fee || 3000
      });

      return opportunity;
    } catch (error) {
      console.error('Error in V2 vs V3 cross arbitrage detection:', error.message);
      return null;
    }
  }

  // V2 Triangular Arbitrage
  async detectV2TriangularArbitrage(path) {
    try {
      console.log(`\n🔺 Scanning V2 Triangular Arbitrage: ${path.map(t => t.slice(0,6)).join('->')}`);
      
      const opportunities = [];
      const fetchers = [
        { fetcher: uniswapV2Fetcher, name: 'UniswapV2' },
        { fetcher: sushiswapFetcher, name: 'Sushiswap' }
      ];

      for (const { fetcher, name } of fetchers) {
        try {
          const amountOut = await fetcher.simulateMultiHop(path, INPUT_AMOUNT);
          
          if (amountOut === 0) {
            console.log(`❌ ${name}: Zero amount out`);
            continue;
          }

          // Calculate reverse path to complete the triangle
          const reversePath = [...path].reverse();
          const outputToken = TOKEN_MAP[path[path.length - 1].toLowerCase()];
          const decOut = outputToken?.decimals || 18;
          const amountForReverse = ethers.parseUnits(amountOut.toString(), decOut);
          
          const amountBack = await fetcher.simulateMultiHop(reversePath, amountForReverse);
          
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

          const opportunity = await this.calculateTriangularProfitability({
            grossProfitEth,
            inputAmount: INPUT_AMOUNT,
            swapFee: SWAP_FEE_V2,
            gasEstimate: GAS_ESTIMATE_TRIANGULAR,
            type: 'V2_TRIANGULAR',
            dex: name,
            path: path.map(t => t.slice(0,6)),
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

  // V3 Triangular Arbitrage
  async detectV3TriangularArbitrage(path) {
    try {
      console.log(`\n🔺 Scanning V3 Triangular Arbitrage: ${path.map(t => t.slice(0,6)).join('->')}`);
      
      const fees = [3000, 3000]; // Use 0.3% fee tier for all hops
      
      const amountOut = await uniswapV3Fetcher.simulateMultiHop(path, fees, INPUT_AMOUNT);
      
      if (amountOut === 0) {
        console.log('❌ V3: Zero amount out');
        return null;
      }

      // Calculate reverse path
      const reversePath = [...path].reverse();
      const reverseFees = [...fees].reverse();
      const outputToken = TOKEN_MAP[path[path.length - 1].toLowerCase()];
      const decOut = outputToken?.decimals || 18;
      const amountForReverse = ethers.parseUnits(amountOut.toString(), decOut);
      
      const amountBack = await uniswapV3Fetcher.simulateMultiHop(reversePath, reverseFees, amountForReverse);
      
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

      const opportunity = await this.calculateTriangularProfitability({
        grossProfitEth,
        inputAmount: INPUT_AMOUNT,
        swapFee: SWAP_FEE_V3,
        gasEstimate: GAS_ESTIMATE_TRIANGULAR,
        type: 'V3_TRIANGULAR',
        dex: 'UniswapV3',
        path: path.map(t => t.slice(0,6)),
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
      const inputAmountNumber = Number(inputAmount) / 1e18;
      const grossMultiplier = sellPrice / buyPrice;
      const grossProfitEth = inputAmountNumber * (grossMultiplier - 1);

      if (grossProfitEth <= 0) {
        console.log('❌ No gross profit');
        return null;
      }

      // Calculate costs
      const swapFeesEth = inputAmountNumber * swapFee * 2; // Two swaps
      
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
      
      // Calculate costs
      const swapFeesEth = inputAmountNumber * swapFee * 3; // Three swaps
      
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

  // Main scanning function
  async scanAllOpportunities() {
    await this.updateEthPrice();
    const opportunities = [];
    const currentBlock = await this.provider.getBlockNumber();
    
    console.log(`\n🚀 Starting arbitrage scan at block ${currentBlock}`);
    console.log(`📊 Scanning ${TRADING_PAIRS.length} pairs and ${TRIANGULAR_PATHS.length} triangular paths`);

    try {
      // Scan simple arbitrage opportunities
      const simplePromises = TRADING_PAIRS.map(async (pair) => {
        const results = await Promise.allSettled([
          this.detectV2SimpleArbitrage(pair),
        //   this.detectV3SimpleArbitrage(pair),
        //   this.detectV2V3CrossArbitrage(pair)
        ]);

        return results
          .filter(result => result.status === 'fulfilled' && result.value !== null)
          .map(result => ({ ...result.value, blockNumber: currentBlock }));
      });

      // Scan triangular arbitrage opportunities
      const triangularPromises = TRIANGULAR_PATHS.map(async (path) => {
        const results = await Promise.allSettled([
          this.detectV2TriangularArbitrage(path),
          this.detectV3TriangularArbitrage(path)
        ]);

        return results
          .filter(result => result.status === 'fulfilled' && result.value !== null)
          .map(result => ({ ...result.value, blockNumber: currentBlock }));
      });

      // Wait for all scans to complete
      const [simpleResults, triangularResults] = await Promise.all([
        Promise.all(simplePromises),
        Promise.all(triangularPromises)
      ]);

      // Flatten results
      const allSimple = simpleResults.flat().flat();
      const allTriangular = triangularResults.flat().flat();
      
      opportunities.push(...allSimple, ...allTriangular);

      // Sort by profitability
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

  // Monitor real-time opportunities
  startRealTimeMonitoring() {
    console.log('🔄 Starting real-time arbitrage monitoring...');
    
    // Monitor new blocks
    wsProvider.subscribeToBlocks(async (blockNumber) => {
      console.log(`\n🆕 New block ${blockNumber} - scanning for opportunities...`);
      
      try {
        const opportunities = await this.scanAllOpportunities();
        
        if (opportunities.length > 0) {
          console.log(`⚡ Found ${opportunities.length} real-time opportunities in block ${blockNumber}`);
          
          // Emit event for opportunities (you can integrate with your database here)
          this.emit('opportunities', opportunities);
        }
      } catch (error) {
        console.error(`Error scanning block ${blockNumber}:`, error.message);
      }
    });

    // Monitor pending transactions for MEV opportunities
    wsProvider.subscribeToPendingTxs((txHash) => {
      // Advanced: Analyze pending transactions for sandwich attacks, frontrunning, etc.
      // This is complex and requires careful implementation
      console.log(`📋 Pending tx: ${txHash}`);
    });
  }

  // Stop monitoring
  stopRealTimeMonitoring() {
    console.log('🛑 Stopping real-time arbitrage monitoring...');
    wsProvider.unsubscribeFromBlocks();
    wsProvider.unsubscribeFromPendingTxs();
  }

  // Get statistics about detected opportunities
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

    stats.averageProfitEth = stats.totalProfitEth / stats.total;

    // Count opportunities by type
    opportunities.forEach(opp => {
      stats.types[opp.type] = (stats.types[opp.type] || 0) + 1;
    });

    return stats;
  }

  // Event emitter functionality
  emit(event, data) {
    if (this.listeners && this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error.message);
        }
      });
    }
  }

  on(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners || !this.listeners[event]) return;
    
    const index = this.listeners[event].indexOf(callback);
    if (index > -1) {
      this.listeners[event].splice(index, 1);
    }
  }

  // Remove all listeners for an event
  removeAllListeners(event) {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

export default ArbitrageDetector;