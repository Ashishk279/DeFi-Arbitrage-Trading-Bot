import mongoose from 'mongoose';

const opportunitySchema = new mongoose.Schema({
  // Basic opportunity info
  type: {
    type: String,
    required: true,
    enum: ['V2_SIMPLE', 'V3_SIMPLE', 'V2_V3_CROSS', 'V2_TRIANGULAR', 'V3_TRIANGULAR']
  },
  pair: {
    type: String,
    required: true
  },
  
  // For simple arbitrage
  dex1: {
    type: String,
    default: ''
  },
  dex1Price: {
    type: Number,
    default: 0
  },
  dex2: {
    type: String,
    default: ''
  },
  dex2Price: {
    type: Number,
    default: 0
  },
  
  // For triangular arbitrage
  isTriangular: {
    type: Boolean,
    default: false
  },
  triangularPath: [{
    type: String
  }],
  triangularDex: {
    type: String,
    default: ''
  },
  
  // Financial data
  profitEth: {
    type: Number,
    required: true
  },
  profitUsd: {
    type: Number,
    default: 0
  },
  profitToken: {
    type: Number,
    default: 0
  },
  profitTokenSymbol: {
    type: String,
    default: ''
  },
  profitPercentage: {
    type: Number,
    default: 0
  },
  gasEstimate: {
    type: Number,
    default: 0
  },
  gasPrice: {
    type: String,
    default: '0'
  },
  platformFees: {
    type: Number,
    default: 0
  },
  
  // V3 specific
  fee1: {
    type: Number,
    default: 0
  },
  fee2: {
    type: Number,
    default: 0
  },
  
  // Execution details
  inputAmount: {
    type: String,
    required: true
  },
  inputTokenSymbol: {
    type: String,
    default: ''
  },
  outputAmount: {
    type: String,
    default: '0'
  },
  outputTokenSymbol: {
    type: String,
    default: ''
  },
  priceImpact: {
    type: Number,
    default: 0
  },
  
  // Status
  profitable: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  blockNumber: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  executed: {
    type: Boolean,
    default: false
  },
  txHash: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  indexes: [
    { key: { type: 1, timestamp: -1 } },
    { key: { profitEth: -1 } },
    { key: { pair: 1, timestamp: -1 } },
    { key: { executed: 1, timestamp: -1 } },
    { key: { profitable: 1, timestamp: -1 } }
  ]
});

// Instance methods
opportunitySchema.methods.toDisplayFormat = function() {
  return {
    id: this._id,
    type: this.type,
    pair: this.pair,
    profitEth: this.profitEth.toFixed(6),
    profitUsd: this.profitUsd.toFixed(2),
    profitToken: this.profitToken.toFixed(this.profitTokenSymbol === 'USDC' ? 6 : 18),
    profitTokenSymbol: this.profitTokenSymbol,
    profitPercentage: this.profitPercentage.toFixed(2),
    dex1: this.dex1,
    dex2: this.dex2,
    dex1Price: this.dex1Price,
    dex2Price: this.dex2Price,
    isTriangular: this.isTriangular,
    triangularPath: this.triangularPath,
    triangularDex: this.triangularDex,
    gasEstimate: this.gasEstimate,
    platformFees: this.platformFees.toFixed(4),
    inputAmount: this.inputAmount,
    inputTokenSymbol: this.inputTokenSymbol,
    outputAmount: this.outputAmount,
    outputTokenSymbol: this.outputTokenSymbol,
    profitable: this.profitable,
    timestamp: this.timestamp,
    executed: this.executed
  };
};

// Static methods
opportunitySchema.statics.findProfitableOpportunities = function(minProfitEth = 0.001) {
  return this.find({
    profitEth: { $gte: minProfitEth },
    profitable: true,
    executed: false
  }).sort({ profitEth: -1 });
};

opportunitySchema.statics.findAllOpportunities = function(limit = 10) {
  return this.find({})
    .sort({ timestamp: -1 })
    .limit(limit);
};

opportunitySchema.statics.getStatsByType = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        avgProfit: { $avg: '$profitEth' },
        maxProfit: { $max: '$profitEth' },
        totalProfit: { $sum: '$profitEth' }
      }
    },
    { $sort: { totalProfit: -1 } }
  ]);
};

opportunitySchema.statics.getHourlyStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' }
        },
        count: { $sum: 1 },
        avgProfit: { $avg: '$profitEth' },
        maxProfit: { $max: '$profitEth' }
      }
    },
    { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1, '_id.hour': -1 } },
    { $limit: 24 }
  ]);
};

const Opportunity = mongoose.model('Opportunity', opportunitySchema);

export default Opportunity;