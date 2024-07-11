export type TxProviderConfig = {
  txProviderNodeUrl: string | undefined;
};

export function getTxProviderConfigFromEnv(): TxProviderConfig {
  return {
    txProviderNodeUrl: process.env.TX_PROVIDER_NODE_URL,
  };
}
