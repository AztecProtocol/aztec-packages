export type TxProviderConfig = {
  txProviderNodeUrl: string | undefined;
};

export const txProviderConfigMappings = {
  txProviderNodeUrl: {
    env: 'TX_PROVIDER_NODE_URL',
    description: 'The URL of the tx provider node',
    parseEnv: (val: string) => val || process.env.AZTEC_NODE_URL,
  },
};

export function getTxProviderConfigFromEnv(): TxProviderConfig {
  return {
    txProviderNodeUrl: process.env.TX_PROVIDER_NODE_URL ?? process.env.AZTEC_NODE_URL,
  };
}
