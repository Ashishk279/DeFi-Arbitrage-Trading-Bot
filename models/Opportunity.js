import mongoose from 'mongoose';

const opportunitySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  pair: { type: String }, // e.g., 'WETH-USDC'
  dex1: { type: String }, // e.g., 'UniswapV2'
  dex1Price: { type: Number },
  dex2: { type: String },
  dex2Price: { type: Number },
  profitEth: { type: Number },
  isTriangular: { type: Boolean, default: false },
  trianglePairs: { type: String, default: '' } // e.g., 'WETH-USDC,USDC-DAI,DAI-WETH'
});

const Opportunity = mongoose.model('Opportunity', opportunitySchema);

export default Opportunity;