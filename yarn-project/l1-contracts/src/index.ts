export interface L1Addresses {
  rollupContract: string;
  feeDistributor: string;
}

// TODO: Populate from env vars?
export function getL1Addresses(): L1Addresses {
  return {
    rollupContract: '',
    feeDistributor: '',
  };
}

export * from './aztec-ethereumjs-contracts/Rollup.js';
