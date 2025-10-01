// 1_000_000_000 Gwei = 1 ETH
// 1_000_000_000 Wei = 1 Gwei
// 1_000_000_000_000_000_000 Wei = 1 ETH
export const WEI_CONST = 1_000_000_000n;

// @note using this large gas limit to avoid the issue of `gas limit too low` when estimating gas in reth
export const LARGE_GAS_LIMIT = 12_000_000n;

// setting a minimum bump percentage to 10% due to geth's implementation
// https://github.com/ethereum/go-ethereum/blob/e3d61e6db028c412f74bc4d4c7e117a9e29d0de0/core/txpool/legacypool/list.go#L298
export const MIN_REPLACEMENT_BUMP_PERCENTAGE = 10;

// setting a minimum bump percentage to 100% due to geth's implementation
// https://github.com/ethereum/go-ethereum/blob/e3d61e6db028c412f74bc4d4c7e117a9e29d0de0/core/txpool/blobpool/config.go#L34
export const MIN_BLOB_REPLACEMENT_BUMP_PERCENTAGE = 100;

// Avg ethereum block time is ~12s
export const BLOCK_TIME_MS = 12_000;
