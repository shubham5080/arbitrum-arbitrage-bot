import { DEXES } from "./dexes";

export const POOLS = {
  WETH: {
    address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    [DEXES.UNISWAP]: {
      address: "0xc6962004f452be9203591991d15f6b388e09e8d0",
      fee: 500,
    },
    [DEXES.SUSHI]: {
      address: "0xf3eb87c1f6020982173c908e7eb31aa66c1f0296",
      fee: 500,
    },
  },

  ARB: {
    address: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    [DEXES.UNISWAP]: {
      address: "0xb0f6ca40411360c03d41c5ffc5f179b8403dcdf8",
      fee: 500,
    },
    [DEXES.SUSHI]: {
      address: "0xfa1cc0cae7779b214b1112322a2d1cf0b511c3bc",
      fee: 500,
    },
  },

  LINK: {
    address: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
    [DEXES.SUSHI]: {
      address: "0x7e039fc42a52d717e79288d58742a41c7bd2b742",
      fee: 3000,
    },
  },

  UNI: {
    address: "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0",
    [DEXES.UNISWAP]: {
      address: "0xeaf86d2b37dbed7ebebd9f4a2728a87f083a6c43",
      fee: 500,
    },
    [DEXES.SUSHI]: {
      address: "0xf7dac6853b09756500cc3b32f847bd6be257d074",
      fee: 3000,
    },
  },
};
