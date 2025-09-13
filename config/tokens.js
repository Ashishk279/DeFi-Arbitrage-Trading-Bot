import { Token } from '@uniswap/sdk-core';

// Token definitions for 15 major tokens
export const TOKENS = {
  WETH: new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH', 'Wrapped Ether'),
  USDC: new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin'),
  DAI: new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'Dai Stablecoin'),
  WBTC: new Token(1, '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 8, 'WBTC', 'Wrapped Bitcoin'),
  UNI: new Token(1, '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 18, 'UNI', 'Uniswap'),
  LINK: new Token(1, '0x514910771AF9Ca656af840dff83E8264EcF986CA', 18, 'LINK', 'Chainlink'),
  AAVE: new Token(1, '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', 18, 'AAVE', 'Aave'),
  COMP: new Token(1, '0xc00e94Cb662C3520282E6f5717214004A7f26888', 18, 'COMP', 'Compound'),
  SNX: new Token(1, '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F', 18, 'SNX', 'Synthetix'),
  CRV: new Token(1, '0xD533a949740bb3306d119CC777fa900bA034cd52', 18, 'CRV', 'Curve DAO Token'),
  SUSHI: new Token(1, '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2', 18, 'SUSHI', 'SushiToken'),
  MKR: new Token(1, '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', 18, 'MKR', 'Maker'),
  YFI: new Token(1, '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e', 18, 'YFI', 'yearn.finance'),
  GRT: new Token(1, '0xc944E90C64B2c07662A292be6244BDf05Cda44a7', 18, 'GRT', 'The Graph'),
  MATIC: new Token(1, '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', 18, 'MATIC', 'Matic Token')
};

export const TOKEN_ADDRESSES = Object.values(TOKENS).map(token => token.address);

export const TOKEN_MAP = Object.values(TOKENS).reduce((map, token) => {
  map[token.address.toLowerCase()] = token;
  return map;
}, {});

export const TOKEN_DECIMALS = Object.values(TOKENS).reduce((decimals, token) => {
  decimals[token.address.toLowerCase()] = token.decimals;
  return decimals;
}, {});

// Popular trading pairs for arbitrage
export const TRADING_PAIRS = [
  [TOKENS.WETH.address, TOKENS.USDC.address],
  [TOKENS.WETH.address, TOKENS.DAI.address],
  [TOKENS.WETH.address, TOKENS.WBTC.address],
  [TOKENS.WETH.address, TOKENS.UNI.address],
  [TOKENS.WETH.address, TOKENS.LINK.address],
  [TOKENS.WETH.address, TOKENS.AAVE.address],
  [TOKENS.USDC.address, TOKENS.DAI.address],
  [TOKENS.USDC.address, TOKENS.WBTC.address],
  [TOKENS.USDC.address, TOKENS.UNI.address],
  [TOKENS.USDC.address, TOKENS.LINK.address],
  [TOKENS.WBTC.address, TOKENS.UNI.address],
  [TOKENS.UNI.address, TOKENS.LINK.address],
  [TOKENS.AAVE.address, TOKENS.COMP.address],
  [TOKENS.CRV.address, TOKENS.SUSHI.address],
  [TOKENS.MKR.address, TOKENS.YFI.address]
];

// Triangular arbitrage paths
export const TRIANGULAR_PATHS = [
  [TOKENS.WETH.address, TOKENS.USDC.address, TOKENS.DAI.address],
  [TOKENS.WETH.address, TOKENS.USDC.address, TOKENS.WBTC.address],
  [TOKENS.WETH.address, TOKENS.UNI.address, TOKENS.LINK.address],
  [TOKENS.USDC.address, TOKENS.WBTC.address, TOKENS.DAI.address],
  [TOKENS.UNI.address, TOKENS.LINK.address, TOKENS.AAVE.address],
  [TOKENS.COMP.address, TOKENS.AAVE.address, TOKENS.MKR.address],
  [TOKENS.CRV.address, TOKENS.SUSHI.address, TOKENS.YFI.address],
  [TOKENS.WETH.address, TOKENS.AAVE.address, TOKENS.COMP.address]
];

export default {
  TOKENS,
  TOKEN_ADDRESSES,
  TOKEN_MAP,
  TOKEN_DECIMALS,
  TRADING_PAIRS,
  TRIANGULAR_PATHS
};