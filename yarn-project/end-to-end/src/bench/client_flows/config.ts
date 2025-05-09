import type { AccountType, BenchmarkingFeePaymentMethod } from './client_flows_benchmark.js';

export type ClientFlowConfig = {
  accounts: AccountType[];
  feePaymentMethods: BenchmarkingFeePaymentMethod[];
  recursions?: number[];
};

type ClientFlows = 'accountDeployments' | 'deployments' | 'transfers' | 'bridging' | 'amm';

export type ClientFlowsConfig = {
  [key in ClientFlows]: ClientFlowConfig;
};

export const KEY_FLOWS_CONFIG: ClientFlowsConfig = {
  accountDeployments: {
    accounts: ['ecdsar1', 'schnorr'],
    feePaymentMethods: ['sponsored_fpc'],
  },
  deployments: {
    accounts: ['ecdsar1', 'schnorr'],
    feePaymentMethods: ['sponsored_fpc'],
  },
  amm: {
    accounts: ['ecdsar1'],
    feePaymentMethods: ['sponsored_fpc'],
  },
  bridging: {
    accounts: ['ecdsar1'],
    feePaymentMethods: ['sponsored_fpc'],
  },
  transfers: {
    accounts: ['ecdsar1'],
    feePaymentMethods: ['sponsored_fpc', 'private_fpc'],
    recursions: [0, 1],
  },
};

export const FULL_FLOWS_CONFIG: ClientFlowsConfig = {
  accountDeployments: {
    accounts: ['ecdsar1', 'schnorr'],
    feePaymentMethods: ['bridged_fee_juice', 'sponsored_fpc'],
  },
  deployments: {
    accounts: ['ecdsar1', 'schnorr'],
    feePaymentMethods: ['bridged_fee_juice', 'sponsored_fpc'],
  },
  amm: {
    accounts: ['ecdsar1', 'schnorr'],
    feePaymentMethods: ['sponsored_fpc', 'private_fpc'],
  },
  bridging: {
    accounts: ['ecdsar1', 'schnorr'],
    feePaymentMethods: ['sponsored_fpc', 'private_fpc'],
  },
  transfers: {
    accounts: ['ecdsar1', 'schnorr'],
    feePaymentMethods: ['sponsored_fpc', 'private_fpc'],
    recursions: [0, 1, 2],
  },
};
