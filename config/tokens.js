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

// Valid trading pairs with pool addresses for Uniswap V2, Sushiswap, PancakeSwap, and Uniswap V3
export const VALID_TRADING_PAIRS = [
  {
    pair: [TOKENS.WETH.address, TOKENS.USDC.address],
    pools: {
      UniswapV2: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
      Sushiswap: '0x397FF1542f962076d0BFE58eA045FfA2d347ACa0',
      PancakeSwap: '0x2E8135bE71230c6B1B4045696d41C09Db0414226',
      UniswapV3: [
        { fee: 100, address: '0xE0554a476A092703abdB3Ef35c80e0D76d32939F' },
        { fee: 500, address: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' },
        { fee: 3000, address: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8' },
        { fee: 10000, address: '0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387' }
      ]
    }
  },
  {
    pair: [TOKENS.WETH.address, TOKENS.DAI.address],
    pools: {
      UniswapV2: '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11',
      Sushiswap: '0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f',
      PancakeSwap: null,
      UniswapV3: [
        { fee: 100, address: '0xD8dEC118e1215F02e10DB846DCbBfE27d477aC19' },
        { fee: 500, address: '0x60594a405d53811d3BC4766596EFD80fd545A270' },
        { fee: 3000, address: '0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8' },
        { fee: 10000, address: '0xa80964C5bBd1A0E95777094420555fead1A26c1e' }
      ]
    }
  },
  {
    pair: [TOKENS.WETH.address, TOKENS.WBTC.address],
    pools: {
      UniswapV2: '0xBb2b8038a1640196FbE3e38816F3e67Cba72D940',
      Sushiswap: '0xCEfF51756c56CeFFCA006cD410B03FFC46dd3a58',
      PancakeSwap: '0x4AB6702B3Ed3877e9b1f203f90cbEF13d663B0e8',
      UniswapV3: [
        { fee: 100, address: '0xe6ff8b9A37B0fab776134636D9981Aa778c4e718' },
        { fee: 500, address: '0x4585FE77225b41b697C938B018E2Ac67Ac5a20c0' },
        { fee: 3000, address: '0xCBCdF9626bC03E24f779434178A73a0B4bad62eD' },
        { fee: 10000, address: '0x6Ab3bba2F41e7eAA262fa5A1A9b3932fA161526F' }
      ]
    }
  },
  {
    pair: [TOKENS.WETH.address, TOKENS.UNI.address],
    pools: {
      UniswapV2: '0xd3d2E2692501A5c9Ca623199D38826e513033a17',
      Sushiswap: '0xDafd66636E2561b0284EDdE37e42d192F2844D40',
      PancakeSwap: null,
      UniswapV3: [
        { fee: 500, address: '0xfaA318479b7755b2dBfDD34dC306cb28B420Ad12' },
        { fee: 3000, address: '0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801' },
        { fee: 10000, address: '0x360b9726186C0F62cc719450685ce70280774Dc8' }
      ]
    }
  },
  {
    pair: [TOKENS.WETH.address, TOKENS.LINK.address],
    pools: {
      UniswapV2: '0xa2107FA5B38d9bbd2C461D6EDf11B11A50F6b974',
      Sushiswap: '0xC40D16476380e4037e6b1A2594cAF6a6cc8Da967',
      PancakeSwap: null,
      UniswapV3: [
        { fee: 500, address: '0x5d4F3C6fA16908609BAC31Ff148Bd002AA6b8c83' },
        { fee: 3000, address: '0xa6Cc3C2531FdaA6Ae1A3CA84c2855806728693e8' },
        { fee: 10000, address: '0x3A0f221eA8B150f3D3d27DE8928851aB5264bB65' }
      ]
    }
  },
  {
    pair: [TOKENS.WETH.address, TOKENS.AAVE.address],
    pools: {
      UniswapV2: '0xDFC14d2Af169B0D36C4EFF567Ada9b2E0CAE044f',
      Sushiswap: '0xD75EA151a61d06868E31F8988D28DFE5E9df57B4',
      PancakeSwap: null,
      UniswapV3: [
        { fee: 500, address: '0x4674abc5796e1334B5075326b39B748bee9EaA34' },
        { fee: 3000, address: '0x5aB53EE1d50eeF2C1DD3d5402789cd27bB52c1bB' },
        { fee: 10000, address: '0x1353fE67fFf8f376762b7034DC9066f0bE15a723' }
      ]
    }
  },
  {
    pair: [TOKENS.USDC.address, TOKENS.DAI.address],
    pools: {
      UniswapV2: '0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5',
      Sushiswap: '0xAaF5110db6e744ff70fB339DE037B990A20bdace',
      PancakeSwap: '0x2b561b3f99f2a872C4485c61aEec1E935A1968C6',
      UniswapV3: [
        { fee: 100, address: '0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168' },
        { fee: 500, address: '0x6c6Bc977E13Df9b0de53b251522280BB72383700' },
        { fee: 3000, address: '0xa63b490aA077f541c9d64bFc1Cc0db2a752157b5' },
        { fee: 10000, address: '0x6958686b6348c3D6d5f2dCA3106A5C09C156873a' }
      ]
    }
  },
  {
    pair: [TOKENS.USDC.address, TOKENS.WBTC.address],
    pools: {
      UniswapV2: '0x004375Dff511095CC5A197A54140a24eFEF3A416',
      Sushiswap: null,
      PancakeSwap: '0xbC03ce3F4236C82A3A3270af02C15a6A42857E90',
      UniswapV3: [
        { fee: 100, address: '0x026Babd2ae9379525030Fc2574e39bc156C10583' },
        { fee: 500, address: '0x9a772018FbD77fcD2d25657e5C547BAfF3Fd7D16' },
        { fee: 3000, address: '0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35' },
        { fee: 10000, address: '0xCBFB0745b8489973Bf7b334d54fdBd573Df7eF3c' }
      ]
    }
  },
  {
    pair: [TOKENS.USDC.address, TOKENS.UNI.address],
    pools: {
      UniswapV2: '0xEBFb684dD2b01E698ca6c14F10e4f289934a54D6',
      Sushiswap: null,
      PancakeSwap: null,
      UniswapV3: [
        { fee: 3000, address: '0xD0fC8bA7E267f2bc56044A7715A489d851dC6D78' },
        { fee: 10000, address: '0xE845469aAe04f8823202b011A848cf199420B4C1' }
      ]
    }
  },
  {
    pair: [TOKENS.USDC.address, TOKENS.LINK.address],
    pools: {
      UniswapV2: '0xd8C8a2B125527bf97c8e4845b25dE7e964468F77',
      Sushiswap: '0x2101072e369761435A532a83369984Ec3950aEF2',
      PancakeSwap: null,
      UniswapV3: [
        { fee: 3000, address: '0xFAD57d2039C21811C8F2B5D5B65308aa99D31559' }
      ]
    }
  },
  {
    pair: [TOKENS.WBTC.address, TOKENS.UNI.address],
    pools: {
      UniswapV2: '0xAA873C9DA6541f13C89416C17271b4c21bf7B2d7',
      Sushiswap: null,
      PancakeSwap: null,
      UniswapV3: [
        { fee: 3000, address: '0x8F0CB37cdFF37E004E0088f563E5fe39E05CCC5B' }
      ]
    }
  },
  {
    pair: [TOKENS.UNI.address, TOKENS.LINK.address],
    pools: {
      UniswapV2: '0x9b2662DC8b80B0fE79310AD316b943CB5Bb15e8b',
      Sushiswap: '0xCf789E7f539151b18E442DC183E7C454edFb69Aa',
      PancakeSwap: null,
      UniswapV3: [
        { fee: 3000, address: '0x9f178e86E42DDF2379CB3D2AcF9Ed67A1eD2550a' },
        { fee: 10000, address: '0xA6B9a13B34db2A00284299c47DACF49FB62C1755' }
      ]
    }
  },
  {
    pair: [TOKENS.AAVE.address, TOKENS.COMP.address],
    pools: {
      UniswapV2: null,
      Sushiswap: null,
      PancakeSwap: null,
      UniswapV3: [
        { fee: 10000, address: '0xCEee866d0893EA3c0Cc7d1bE290D53f8B8fE2596' }
      ]
    }
  }
];

// Valid triangular paths constructed from valid trading pairs
export const VALID_TRIANGULAR_PATHS = [
  {
    path: [TOKENS.WETH.address, TOKENS.USDC.address, TOKENS.DAI.address],
    pools: [
      {
        pair: [TOKENS.WETH.address, TOKENS.USDC.address],
        UniswapV2: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
        Sushiswap: '0x397FF1542f962076d0BFE58eA045FfA2d347ACa0',
        PancakeSwap: '0x2E8135bE71230c6B1B4045696d41C09Db0414226',
        UniswapV3: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8' // Fee 3000
      },
      {
        pair: [TOKENS.USDC.address, TOKENS.DAI.address],
        UniswapV2: '0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5',
        Sushiswap: '0xAaF5110db6e744ff70fB339DE037B990A20bdace',
        PancakeSwap: '0x2b561b3f99f2a872C4485c61aEec1E935A1968C6',
        UniswapV3: '0xa63b490aA077f541c9d64bFc1Cc0db2a752157b5' // Fee 3000
      }
    ]
  },
  {
    path: [TOKENS.WETH.address, TOKENS.USDC.address, TOKENS.WBTC.address],
    pools: [
      {
        pair: [TOKENS.WETH.address, TOKENS.USDC.address],
        UniswapV2: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
        Sushiswap: '0x397FF1542f962076d0BFE58eA045FfA2d347ACa0',
        PancakeSwap: '0x2E8135bE71230c6B1B4045696d41C09Db0414226',
        UniswapV3: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8' // Fee 3000
      },
      {
        pair: [TOKENS.USDC.address, TOKENS.WBTC.address],
        UniswapV2: '0x004375Dff511095CC5A197A54140a24eFEF3A416',
        Sushiswap: null,
        PancakeSwap: '0xbC03ce3F4236C82A3A3270af02C15a6A42857E90',
        UniswapV3: '0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35' // Fee 3000
      }
    ]
  },
  {
    path: [TOKENS.WETH.address, TOKENS.UNI.address, TOKENS.LINK.address],
    pools: [
      {
        pair: [TOKENS.WETH.address, TOKENS.UNI.address],
        UniswapV2: '0xd3d2E2692501A5c9Ca623199D38826e513033a17',
        Sushiswap: '0xDafd66636E2561b0284EDdE37e42d192F2844D40',
        PancakeSwap: null,
        UniswapV3: '0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801' // Fee 3000
      },
      {
        pair: [TOKENS.UNI.address, TOKENS.LINK.address],
        UniswapV2: '0x9b2662DC8b80B0fE79310AD316b943CB5Bb15e8b',
        Sushiswap: '0xCf789E7f539151b18E442DC183E7C454edFb69Aa',
        PancakeSwap: null,
        UniswapV3: '0x9f178e86E42DDF2379CB3D2AcF9Ed67A1eD2550a' // Fee 3000
      }
    ]
  },
  {
    path: [TOKENS.USDC.address, TOKENS.WBTC.address, TOKENS.DAI.address],
    pools: [
      {
        pair: [TOKENS.USDC.address, TOKENS.WBTC.address],
        UniswapV2: '0x004375Dff511095CC5A197A54140a24eFEF3A416',
        Sushiswap: null,
        PancakeSwap: '0xbC03ce3F4236C82A3A3270af02C15a6A42857E90',
        UniswapV3: '0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35' // Fee 3000
      },
      {
        pair: [TOKENS.WBTC.address, TOKENS.DAI.address],
        UniswapV2: null,
        Sushiswap: null,
        PancakeSwap: null,
        UniswapV3: '0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8' // Fee 3000 (WETH-DAI, adjusted in path)
      }
    ]
  },
  {
    path: [TOKENS.WETH.address, TOKENS.AAVE.address, TOKENS.COMP.address],
    pools: [
      {
        pair: [TOKENS.WETH.address, TOKENS.AAVE.address],
        UniswapV2: '0xDFC14d2Af169B0D36C4EFF567Ada9b2E0CAE044f',
        Sushiswap: '0xD75EA151a61d06868E31F8988D28DFE5E9df57B4',
        PancakeSwap: null,
        UniswapV3: '0x5aB53EE1d50eeF2C1DD3d5402789cd27bB52c1bB' // Fee 3000
      },
      {
        pair: [TOKENS.AAVE.address, TOKENS.COMP.address],
        UniswapV2: null,
        Sushiswap: null,
        PancakeSwap: null,
        UniswapV3: '0xCEee866d0893EA3c0Cc7d1bE290D53f8B8fE2596' // Fee 10000
      }
    ]
  }
];

export default {
  TOKENS,
  TOKEN_ADDRESSES,
  TOKEN_MAP,
  TOKEN_DECIMALS,
  TRADING_PAIRS,
  TRIANGULAR_PATHS
};



// 📋 Initializing pairs for UniswapV2
// 📊 Current block number: 23354881
// ✅ WebSocket provider initialized successfully
// ✅ UniswapV2 Pair: 0xC02a-0xA0b8 @ 0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc
// ✅ UniswapV2 Pair: 0xC02a-0x6B17 @ 0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11
// ✅ UniswapV2 Pair: 0xC02a-0x2260 @ 0xBb2b8038a1640196FbE3e38816F3e67Cba72D940
// ✅ UniswapV2 Pair: 0xC02a-0x1f98 @ 0xd3d2E2692501A5c9Ca623199D38826e513033a17
// ✅ UniswapV2 Pair: 0xC02a-0x5149 @ 0xa2107FA5B38d9bbd2C461D6EDf11B11A50F6b974
// ✅ UniswapV2 Pair: 0xC02a-0x7Fc6 @ 0xDFC14d2Af169B0D36C4EFF567Ada9b2E0CAE044f
// ✅ UniswapV2 Pair: 0xA0b8-0x6B17 @ 0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5
// ✅ UniswapV2 Pair: 0xA0b8-0x2260 @ 0x004375Dff511095CC5A197A54140a24eFEF3A416
// ✅ UniswapV2 Pair: 0xA0b8-0x1f98 @ 0xEBFb684dD2b01E698ca6c14F10e4f289934a54D6
// ✅ UniswapV2 Pair: 0xA0b8-0x5149 @ 0xd8C8a2B125527bf97c8e4845b25dE7e964468F77
// ✅ UniswapV2 Pair: 0x2260-0x1f98 @ 0xAA873C9DA6541f13C89416C17271b4c21bf7B2d7
// ✅ UniswapV2 Pair: 0x1f98-0x5149 @ 0x9b2662DC8b80B0fE79310AD316b943CB5Bb15e8b
// ❌ UniswapV2 Pair: 0x7Fc6-0xc00e - Does not exist
// ❌ UniswapV2 Pair: 0xD533-0x6B35 - Does not exist
// ❌ UniswapV2 Pair: 0x9f8F-0x0bc5 - Does not exist
// Found 12 valid pairs on UniswapV2

// 📋 Initializing pairs for Sushiswap
// ✅ Sushiswap Pair: 0xC02a-0xA0b8 @ 0x397FF1542f962076d0BFE58eA045FfA2d347ACa0
// ✅ Sushiswap Pair: 0xC02a-0x6B17 @ 0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f
// ✅ Sushiswap Pair: 0xC02a-0x2260 @ 0xCEfF51756c56CeFFCA006cD410B03FFC46dd3a58
// ✅ Sushiswap Pair: 0xC02a-0x1f98 @ 0xDafd66636E2561b0284EDdE37e42d192F2844D40
// ✅ Sushiswap Pair: 0xC02a-0x5149 @ 0xC40D16476380e4037e6b1A2594cAF6a6cc8Da967
// ✅ Sushiswap Pair: 0xC02a-0x7Fc6 @ 0xD75EA151a61d06868E31F8988D28DFE5E9df57B4
// ✅ Sushiswap Pair: 0xA0b8-0x6B17 @ 0xAaF5110db6e744ff70fB339DE037B990A20bdace
// ❌ Sushiswap Pair: 0xA0b8-0x2260 - Does not exist
// ❌ Sushiswap Pair: 0xA0b8-0x1f98 - Does not exist
// ✅ Sushiswap Pair: 0xA0b8-0x5149 @ 0x2101072e369761435A532a83369984Ec3950aEF2
// ❌ Sushiswap Pair: 0x2260-0x1f98 - Does not exist
// ✅ Sushiswap Pair: 0x1f98-0x5149 @ 0xCf789E7f539151b18E442DC183E7C454edFb69Aa
// ❌ Sushiswap Pair: 0x7Fc6-0xc00e - Does not exist
// ❌ Sushiswap Pair: 0xD533-0x6B35 - Does not exist
// ❌ Sushiswap Pair: 0x9f8F-0x0bc5 - Does not exist
// Found 9 valid pairs on Sushiswap

// 📋 Initializing pairs for PancakeSwap
// ✅ PancakeSwap Pair: 0xC02a-0xA0b8 @ 0x2E8135bE71230c6B1B4045696d41C09Db0414226
// ❌ PancakeSwap Pair: 0xC02a-0x6B17 - Does not exist
// ✅ PancakeSwap Pair: 0xC02a-0x2260 @ 0x4AB6702B3Ed3877e9b1f203f90cbEF13d663B0e8
// ❌ PancakeSwap Pair: 0xC02a-0x1f98 - Does not exist
// ❌ PancakeSwap Pair: 0xC02a-0x5149 - Does not exist
// ❌ PancakeSwap Pair: 0xC02a-0x7Fc6 - Does not exist
// ✅ PancakeSwap Pair: 0xA0b8-0x6B17 @ 0x2b561b3f99f2a872C4485c61aEec1E935A1968C6
// ✅ PancakeSwap Pair: 0xA0b8-0x2260 @ 0xbC03ce3F4236C82A3A3270af02C15a6A42857E90
// ❌ PancakeSwap Pair: 0xA0b8-0x1f98 - Does not exist
// ❌ PancakeSwap Pair: 0xA0b8-0x5149 - Does not exist
// ❌ PancakeSwap Pair: 0x2260-0x1f98 - Does not exist
// ❌ PancakeSwap Pair: 0x1f98-0x5149 - Does not exist
// ❌ PancakeSwap Pair: 0x7Fc6-0xc00e - Does not exist
// ❌ PancakeSwap Pair: 0xD533-0x6B35 - Does not exist
// ❌ PancakeSwap Pair: 0x9f8F-0x0bc5 - Does not exist
// Found 4 valid pairs on PancakeSwap

// 📋 Initializing pools for UniswapV3
// Pool found for 0xC02a-0xA0b8 (fee: 100): 0xE0554a47...
// ✅ UniswapV3 Pool: 0xC02a-0xA0b8 (fee: 100) @ 0xE0554a476A092703abdB3Ef35c80e0D76d32939F
// Pool found for 0xC02a-0xA0b8 (fee: 500): 0x88e6A0c2...
// ✅ UniswapV3 Pool: 0xC02a-0xA0b8 (fee: 500) @ 0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640
// Pool found for 0xC02a-0xA0b8 (fee: 3000): 0x8ad599c3...
// ✅ UniswapV3 Pool: 0xC02a-0xA0b8 (fee: 3000) @ 0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8
// Pool found for 0xC02a-0xA0b8 (fee: 10000): 0x7BeA3986...
// ✅ UniswapV3 Pool: 0xC02a-0xA0b8 (fee: 10000) @ 0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387
// Pool found for 0xC02a-0x6B17 (fee: 100): 0xD8dEC118...
// ✅ UniswapV3 Pool: 0xC02a-0x6B17 (fee: 100) @ 0xD8dEC118e1215F02e10DB846DCbBfE27d477aC19
// Pool found for 0xC02a-0x6B17 (fee: 500): 0x60594a40...
// ✅ UniswapV3 Pool: 0xC02a-0x6B17 (fee: 500) @ 0x60594a405d53811d3BC4766596EFD80fd545A270
// Pool found for 0xC02a-0x6B17 (fee: 3000): 0xC2e9F25B...
// ✅ UniswapV3 Pool: 0xC02a-0x6B17 (fee: 3000) @ 0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8
// Pool found for 0xC02a-0x6B17 (fee: 10000): 0xa80964C5...
// ✅ UniswapV3 Pool: 0xC02a-0x6B17 (fee: 10000) @ 0xa80964C5bBd1A0E95777094420555fead1A26c1e
// Pool found for 0xC02a-0x2260 (fee: 100): 0xe6ff8b9A...
// ✅ UniswapV3 Pool: 0xC02a-0x2260 (fee: 100) @ 0xe6ff8b9A37B0fab776134636D9981Aa778c4e718
// Pool found for 0xC02a-0x2260 (fee: 500): 0x4585FE77...
// ✅ UniswapV3 Pool: 0xC02a-0x2260 (fee: 500) @ 0x4585FE77225b41b697C938B018E2Ac67Ac5a20c0
// Pool found for 0xC02a-0x2260 (fee: 3000): 0xCBCdF962...
// ✅ UniswapV3 Pool: 0xC02a-0x2260 (fee: 3000) @ 0xCBCdF9626bC03E24f779434178A73a0B4bad62eD
// Pool found for 0xC02a-0x2260 (fee: 10000): 0x6Ab3bba2...
// ✅ UniswapV3 Pool: 0xC02a-0x2260 (fee: 10000) @ 0x6Ab3bba2F41e7eAA262fa5A1A9b3932fA161526F
// ❌ UniswapV3 Pool: 0xC02a-0x1f98 (fee: 100) - Does not exist
// Pool found for 0xC02a-0x1f98 (fee: 500): 0xfaA31847...
// ✅ UniswapV3 Pool: 0xC02a-0x1f98 (fee: 500) @ 0xfaA318479b7755b2dBfDD34dC306cb28B420Ad12
// Pool found for 0xC02a-0x1f98 (fee: 3000): 0x1d42064F...
// ✅ UniswapV3 Pool: 0xC02a-0x1f98 (fee: 3000) @ 0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801
// Pool found for 0xC02a-0x1f98 (fee: 10000): 0x360b9726...
// ✅ UniswapV3 Pool: 0xC02a-0x1f98 (fee: 10000) @ 0x360b9726186C0F62cc719450685ce70280774Dc8
// ❌ UniswapV3 Pool: 0xC02a-0x5149 (fee: 100) - Does not exist
// Pool found for 0xC02a-0x5149 (fee: 500): 0x5d4F3C6f...
// ✅ UniswapV3 Pool: 0xC02a-0x5149 (fee: 500) @ 0x5d4F3C6fA16908609BAC31Ff148Bd002AA6b8c83
// Pool found for 0xC02a-0x5149 (fee: 3000): 0xa6Cc3C25...
// ✅ UniswapV3 Pool: 0xC02a-0x5149 (fee: 3000) @ 0xa6Cc3C2531FdaA6Ae1A3CA84c2855806728693e8
// Pool found for 0xC02a-0x5149 (fee: 10000): 0x3A0f221e...
// ✅ UniswapV3 Pool: 0xC02a-0x5149 (fee: 10000) @ 0x3A0f221eA8B150f3D3d27DE8928851aB5264bB65
// ❌ UniswapV3 Pool: 0xC02a-0x7Fc6 (fee: 100) - Does not exist
// Pool found for 0xC02a-0x7Fc6 (fee: 500): 0x4674abc5...
// ✅ UniswapV3 Pool: 0xC02a-0x7Fc6 (fee: 500) @ 0x4674abc5796e1334B5075326b39B748bee9EaA34
// Pool found for 0xC02a-0x7Fc6 (fee: 3000): 0x5aB53EE1...
// ✅ UniswapV3 Pool: 0xC02a-0x7Fc6 (fee: 3000) @ 0x5aB53EE1d50eeF2C1DD3d5402789cd27bB52c1bB
// Pool found for 0xC02a-0x7Fc6 (fee: 10000): 0x1353fE67...
// ✅ UniswapV3 Pool: 0xC02a-0x7Fc6 (fee: 10000) @ 0x1353fE67fFf8f376762b7034DC9066f0bE15a723
// Pool found for 0xA0b8-0x6B17 (fee: 100): 0x5777d92f...
// ✅ UniswapV3 Pool: 0xA0b8-0x6B17 (fee: 100) @ 0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168
// Pool found for 0xA0b8-0x6B17 (fee: 500): 0x6c6Bc977...
// ✅ UniswapV3 Pool: 0xA0b8-0x6B17 (fee: 500) @ 0x6c6Bc977E13Df9b0de53b251522280BB72383700
// Pool found for 0xA0b8-0x6B17 (fee: 3000): 0xa63b490a...
// ✅ UniswapV3 Pool: 0xA0b8-0x6B17 (fee: 3000) @ 0xa63b490aA077f541c9d64bFc1Cc0db2a752157b5
// Pool found for 0xA0b8-0x6B17 (fee: 10000): 0x6958686b...
// ✅ UniswapV3 Pool: 0xA0b8-0x6B17 (fee: 10000) @ 0x6958686b6348c3D6d5f2dCA3106A5C09C156873a
// Pool found for 0xA0b8-0x2260 (fee: 100): 0x026Babd2...
// ✅ UniswapV3 Pool: 0xA0b8-0x2260 (fee: 100) @ 0x026Babd2ae9379525030Fc2574e39bc156C10583
// Pool found for 0xA0b8-0x2260 (fee: 500): 0x9a772018...
// ✅ UniswapV3 Pool: 0xA0b8-0x2260 (fee: 500) @ 0x9a772018FbD77fcD2d25657e5C547BAfF3Fd7D16
// Pool found for 0xA0b8-0x2260 (fee: 3000): 0x99ac8cA7...
// ✅ UniswapV3 Pool: 0xA0b8-0x2260 (fee: 3000) @ 0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35
// Pool found for 0xA0b8-0x2260 (fee: 10000): 0xCBFB0745...
// ✅ UniswapV3 Pool: 0xA0b8-0x2260 (fee: 10000) @ 0xCBFB0745b8489973Bf7b334d54fdBd573Df7eF3c
// ❌ UniswapV3 Pool: 0xA0b8-0x1f98 (fee: 100) - Does not exist
// ❌ UniswapV3 Pool: 0xA0b8-0x1f98 (fee: 500) - Does not exist
// Pool found for 0xA0b8-0x1f98 (fee: 3000): 0xD0fC8bA7...
// ✅ UniswapV3 Pool: 0xA0b8-0x1f98 (fee: 3000) @ 0xD0fC8bA7E267f2bc56044A7715A489d851dC6D78
// Pool found for 0xA0b8-0x1f98 (fee: 10000): 0xE845469a...
// ✅ UniswapV3 Pool: 0xA0b8-0x1f98 (fee: 10000) @ 0xE845469aAe04f8823202b011A848cf199420B4C1
// ❌ UniswapV3 Pool: 0xA0b8-0x5149 (fee: 100) - Does not exist
// ❌ UniswapV3 Pool: 0xA0b8-0x5149 (fee: 500) - Does not exist
// Pool found for 0xA0b8-0x5149 (fee: 3000): 0xFAD57d20...
// ✅ UniswapV3 Pool: 0xA0b8-0x5149 (fee: 3000) @ 0xFAD57d2039C21811C8F2B5D5B65308aa99D31559
// ❌ UniswapV3 Pool: 0xA0b8-0x5149 (fee: 10000) - Does not exist
// ❌ UniswapV3 Pool: 0x2260-0x1f98 (fee: 100) - Does not exist
// ❌ UniswapV3 Pool: 0x2260-0x1f98 (fee: 500) - Does not exist
// Pool found for 0x2260-0x1f98 (fee: 3000): 0x8F0CB37c...
// ✅ UniswapV3 Pool: 0x2260-0x1f98 (fee: 3000) @ 0x8F0CB37cdFF37E004E0088f563E5fe39E05CCC5B
// ❌ UniswapV3 Pool: 0x2260-0x1f98 (fee: 10000) - Does not exist
// ❌ UniswapV3 Pool: 0x1f98-0x5149 (fee: 100) - Does not exist
// ❌ UniswapV3 Pool: 0x1f98-0x5149 (fee: 500) - Does not exist
// Pool found for 0x1f98-0x5149 (fee: 3000): 0x9f178e86...
// ✅ UniswapV3 Pool: 0x1f98-0x5149 (fee: 3000) @ 0x9f178e86E42DDF2379CB3D2AcF9Ed67A1eD2550a
// Pool found for 0x1f98-0x5149 (fee: 10000): 0xA6B9a13B...
// ✅ UniswapV3 Pool: 0x1f98-0x5149 (fee: 10000) @ 0xA6B9a13B34db2A00284299c47DACF49FB62C1755
// ❌ UniswapV3 Pool: 0x7Fc6-0xc00e (fee: 100) - Does not exist
// ❌ UniswapV3 Pool: 0x7Fc6-0xc00e (fee: 500) - Does not exist
// ❌ UniswapV3 Pool: 0x7Fc6-0xc00e (fee: 3000) - Does not exist
// Pool found for 0x7Fc6-0xc00e (fee: 10000): 0xCEee866d...
// ✅ UniswapV3 Pool: 0x7Fc6-0xc00e (fee: 10000) @ 0xCEee866d0893EA3c0Cc7d1bE290D53f8B8fE2596
// ❌ UniswapV3 Pool: 0xD533-0x6B35 (fee: 100) - Does not exist
// ❌ UniswapV3 Pool: 0xD533-0x6B35 (fee: 500) - Does not exist
// ❌ UniswapV3 Pool: 0xD533-0x6B35 (fee: 3000) - Does not exist
// ❌ UniswapV3 Pool: 0xD533-0x6B35 (fee: 10000) - Does not exist
// ❌ UniswapV3 Pool: 0x9f8F-0x0bc5 (fee: 100) - Does not exist
// ❌ UniswapV3 Pool: 0x9f8F-0x0bc5 (fee: 500) - Does not exist
// ❌ UniswapV3 Pool: 0x9f8F-0x0bc5 (fee: 3000) - Does not exist
// ❌ UniswapV3 Pool: 0x9f8F-0x0bc5 (fee: 10000) - Does not exist
// Found 36 valid pools on UniswapV3
// All fetchers initialized