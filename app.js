import express from 'express';
import mongoose from 'mongoose';
import cron from 'node-cron';
import dotenv from 'dotenv';
import ArbitrageDetector from './detector/arbitrageDetector.js';
import Opportunity from './models/Opportunity.js';

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/arb_bot';

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const arbitrageDetector = new ArbitrageDetector();

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/scan', async (req, res) => {
  try {
    const opportunities = await arbitrageDetector.scanAllOpportunities();
    res.status(200).json(opportunities);
  } catch (error) {
    console.error('Error in /api/scan:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/opportunities/profitable', async (req, res) => {
  try {
    const minProfit = parseFloat(req.query.minProfit) || 0.001;
    const opportunities = await Opportunity.findProfitableOpportunities(minProfit);
    res.status(200).json(opportunities.map(opp => opp.toDisplayFormat()));
  } catch (error) {
    console.error('Error in /api/opportunities/profitable:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/opportunities/all', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const opportunities = await Opportunity.findAllOpportunities(limit);
    res.status(200).json(opportunities.map(opp => opp.toDisplayFormat()));
  } catch (error) {
    console.error('Error in /api/opportunities/all:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats/by-type', async (req, res) => {
  try {
    const stats = await Opportunity.getStatsByType();
    res.status(200).json(stats);
  } catch (error) {
    console.error('Error in /api/stats/by-type:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats/hourly', async (req, res) => {
  try {
    const stats = await Opportunity.getHourlyStats();
    res.status(200).json(stats);
  } catch (error) {
    console.error('Error in /api/stats/hourly:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const startServer = async () => {
  await connectDB();

  cron.schedule('*/30 * * * * *', async () => {
    console.log(`⏰ Running scheduled arbitrage scan at ${new Date().toISOString()}`);
    await arbitrageDetector.scanAllOpportunities();
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();

export default app;