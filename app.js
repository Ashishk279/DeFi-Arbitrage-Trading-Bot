import express from 'express';
import mongoose from 'mongoose';
import cron from 'node-cron';
import cors from 'cors';
import dotenv from 'dotenv';
import Opportunity from './models/Opportunity.js';
import ArbitrageDetector from './detector/arbitrageDetector.js';
import wsProvider from './providers/websocketProvider.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Initialize arbitrage detector
const arbDetector = new ArbitrageDetector();

// Bot loop function
async function botLoop() {
  try {
    console.log(`\n⏰ [${new Date().toISOString()}] Starting scheduled scan...`);
    const startTime = Date.now();
    
    const opportunities = await arbDetector.scanAllOpportunities();
    
    // Save opportunities to database
    let savedCount = 0;
    for (const opp of opportunities) {
      try {
        const newOpp = new Opportunity({
          type: opp.type,
          pair: opp.pair,
          dex1: opp.dex1 || opp.triangularDex || '',
          dex1Price: opp.dex1Price || 0,
          dex2: opp.dex2 || '',
          dex2Price: opp.dex2Price || 0,
          profitEth: opp.profitEth,
          profitUsd: opp.profitUsd || 0,
          gasEstimate: opp.gasEstimate || 0,
          gasPrice: opp.gasPrice || '0',
          isTriangular: opp.isTriangular || false,
          triangularPath: opp.triangularPath || [],
          triangularDex: opp.triangularDex || '',
          fee1: opp.fee1 || 0,
          fee2: opp.fee2 || 0,
          inputAmount: opp.inputAmount || '0',
          outputAmount: opp.outputAmount || '0',
          blockNumber: opp.blockNumber || 0
        });
        
        await newOpp.save();
        savedCount++;
      } catch (saveError) {
        console.error('Error saving opportunity:', saveError.message);
      }
    }
    
    const scanTime = Date.now() - startTime;
    console.log(`✅ Scan completed in ${scanTime}ms`);
    console.log(`💾 Saved ${savedCount}/${opportunities.length} opportunities to database`);
    
    // Alert for highly profitable opportunities
    const highProfitOpps = opportunities.filter(opp => opp.profitEth > 0.01); // > 0.01 ETH
    if (highProfitOpps.length > 0) {
      console.log(`🚨 HIGH PROFIT ALERT: ${highProfitOpps.length} opportunities > 0.01 ETH!`);
      // You can integrate with notification services here (Discord, Telegram, Email, etc.)
    }
    
  } catch (err) {
    console.error('❌ Error in bot loop:', err.message);
  }
}

// API Routes

// Get recent opportunities
app.get('/api/opportunities', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type;
    const minProfit = parseFloat(req.query.minProfit) || 0;
    
    let query = { profitEth: { $gte: minProfit } };
    if (type) {
      query.type = type;
    }
    
    const opportunities = await Opportunity.find(query)
      .sort({ timestamp: -1 })
      .limit(limit);
    
    res.json(opportunities.map(opp => opp.toDisplayFormat()));
  } catch (error) {
    console.error('Error fetching opportunities:', error.message);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// Get profitable opportunities
app.get('/api/opportunities/profitable', async (req, res) => {
  try {
    const minProfit = parseFloat(req.query.minProfit) || 0.001;
    const opportunities = await Opportunity.findProfitableOpportunities(minProfit);
    
    res.json(opportunities.map(opp => opp.toDisplayFormat()));
  } catch (error) {
    console.error('Error fetching profitable opportunities:', error.message);
    res.status(500).json({ error: 'Failed to fetch profitable opportunities' });
  }
});

// Get statistics by type
app.get('/api/stats/by-type', async (req, res) => {
  try {
    const stats = await Opportunity.getStatsByType();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats by type:', error.message);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get hourly statistics
app.get('/api/stats/hourly', async (req, res) => {
  try {
    const stats = await Opportunity.getHourlyStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching hourly stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch hourly statistics' });
  }
});

// Manual scan trigger
app.post('/api/scan', async (req, res) => {
  try {
    console.log('🔄 Manual scan triggered via API');
    const opportunities = await arbDetector.scanAllOpportunities();
    
    res.json({
      success: true,
      count: opportunities.length,
      opportunities: opportunities.slice(0, 10).map(opp => ({
        type: opp.type,
        pair: opp.pair,
        profitEth: opp.profitEth,
        profitUsd: opp.profitUsd
      }))
    });
  } catch (error) {
    console.error('Error in manual scan:', error.message);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const provider = wsProvider.getProvider();
    const blockNumber = await provider.getBlockNumber();
    const dbCount = await Opportunity.countDocuments();
    
    res.json({
      status: 'healthy',
      blockNumber,
      totalOpportunities: dbCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Dashboard route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Arbitrage Bot Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .stat { text-align: center; }
        .stat h3 { margin: 0; color: #333; }
        .stat p { font-size: 24px; font-weight: bold; color: #007bff; margin: 10px 0; }
        button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .opportunities { max-height: 400px; overflow-y: auto; }
        .opp-item { border-bottom: 1px solid #eee; padding: 10px 0; }
        .profit { font-weight: bold; color: #28a745; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 Arbitrage Bot Dashboard</h1>
        
        <div class="card">
          <h2>Quick Actions</h2>
          <button onclick="manualScan()">🔍 Manual Scan</button>
          <button onclick="refreshData()">🔄 Refresh Data</button>
        </div>
        
        <div class="card">
          <h2>📊 Statistics</h2>
          <div class="stats" id="stats">
            <div class="stat">
              <h3>Total Opportunities</h3>
              <p id="total-opps">Loading...</p>
            </div>
            <div class="stat">
              <h3>Profitable Opportunities</h3>
              <p id="profitable-opps">Loading...</p>
            </div>
            <div class="stat">
              <h3>Best Profit (ETH)</h3>
              <p id="best-profit">Loading...</p>
            </div>
          </div>
        </div>
        
        <div class="card">
          <h2>🏆 Recent Opportunities</h2>
          <div class="opportunities" id="opportunities">
            Loading...
          </div>
        </div>
      </div>
      
      <script>
        async function loadData() {
          try {
            const [opps, profitable] = await Promise.all([
              fetch('/api/opportunities?limit=20'),
              fetch('/api/opportunities/profitable')
            ]);
            
            const opportunities = await opps.json();
            const profitableOpps = await profitable.json();
            
            document.getElementById('total-opps').textContent = opportunities.length;
            document.getElementById('profitable-opps').textContent = profitableOpps.length;
            
            const bestProfit = opportunities.length > 0 ? 
              Math.max(...opportunities.map(o => o.profitEth)) : 0;
            document.getElementById('best-profit').textContent = bestProfit.toFixed(6);
            
            const oppsList = opportunities.map(opp => 
              \`<div class="opp-item">
                <strong>\${opp.type}</strong> - \${opp.pair}
                <br>Profit: <span class="profit">\${opp.profitEth} ETH</span>
                <br>Time: \${new Date(opp.timestamp).toLocaleString()}
              </div>\`
            ).join('');
            
            document.getElementById('opportunities').innerHTML = oppsList || 'No opportunities found';
          } catch (error) {
            console.error('Error loading data:', error);
          }
        }
        
        async function manualScan() {
          const button = event.target;
          button.disabled = true;
          button.textContent = '🔄 Scanning...';
          
          try {
            const response = await fetch('/api/scan', { method: 'POST' });
            const result = await response.json();
            
            alert(\`Scan completed! Found \${result.count} opportunities\`);
            await loadData();
          } catch (error) {
            alert('Scan failed: ' + error.message);
          } finally {
            button.disabled = false;
            button.textContent = '🔍 Manual Scan';
          }
        }
        
        function refreshData() {
          loadData();
        }
        
        // Load initial data
        loadData();
        
        // Auto refresh every 30 seconds
        setInterval(loadData, 30000);
      </script>
    </body>
    </html>
  `);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Express error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await wsProvider.disconnect();
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await wsProvider.disconnect();
  await mongoose.connection.close();
  process.exit(0);
});

// Start server and initialize
async function startServer() {
  try {
    // Wait for WebSocket provider to initialize
    console.log('🚀 Initializing WebSocket provider...');
    await wsProvider.initialize();
    
    // Schedule scans every 30 seconds

    cron.schedule('*/120* * * * *', await botLoop);
    console.log('⏰ Scheduled scans every 30 seconds');
    
    // Optional: Start real-time monitoring
    // arbDetector.startRealTimeMonitoring();
    
    // Start the server
    app.listen(port, () => {
      console.log(`✅ Server running on port ${port}`);
      console.log(`🌐 Dashboard: http://localhost:${port}`);
      console.log(`📡 API: http://localhost:${port}/api`);
    });
    
    // Run initial scan
    console.log('🎯 Running initial scan...');
    await botLoop();
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();