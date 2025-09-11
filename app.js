import express from 'express';
import mongoose from 'mongoose';
import cron from 'node-cron';
import dotenv from 'dotenv';
import Opportunity from './models/Opportunity.js';
import arbDetector from './arbDetector.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

async function botLoop() {
  try {
    const opps = await arbDetector.scanAll();
    for (const opp of opps) {
      const newOpp = new Opportunity({
        pair: opp.pair,
        dex1: opp.buyDex || opp.dex || '',
        dex1Price: opp.buyPrice || 0,
        dex2: opp.sellDex || '',
        dex2Price: opp.sellPrice || 0,
        profitEth: opp.netProfitEth,
        isTriangular: opp.isTriangular,
        trianglePairs: opp.trianglePairs || ''
      });
      await newOpp.save();
    }
    console.log(`[${new Date().toISOString()}] Scanned: Found ${opps.length} opportunities`);
  } catch (err) {
    console.error('Error in bot loop:', err);
  }
}

// Schedule every 30 seconds
cron.schedule('*/30 * * * * *', botLoop);

app.get('/opportunities', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  try {
    const opps = await Opportunity.find().sort({ timestamp: -1 }).limit(limit);
    res.json(opps.map(o => ({
      id: o._id,
      timestamp: o.timestamp,
      pair: o.pair,
      profitEth: o.profitEth,
      isTriangular: o.isTriangular,
      trianglePairs: o.trianglePairs
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});