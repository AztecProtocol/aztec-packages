import type {
  Abi,
  Account,
  Chain,
  Client,
  FallbackTransport,
  GetContractReturnType,
  Hex,
  HttpTransport,
  PublicActions,
  PublicClient,
  PublicRpcSchema,
  WalletActions,
  WalletRpcSchema,
} from 'viem';

/** Type for a viem public client */
export type ViemPublicClient = PublicClient<FallbackTransport<HttpTransport[]>, Chain>;

export type PublicRpcDebugSchema = [
  {
    Method: 'debug_traceTransaction';
    Parameters: [txHash: `0x${string}`, options: { tracer: 'callTracer' }];
    ReturnType: DebugCallTrace;
  },
  {
    Method: 'trace_transaction';
    Parameters: [txHash: `0x${string}`];
    ReturnType: TraceTransactionResponse[];
  },
];

/** Return type for a debug_traceTransaction call */
export type DebugCallTrace = {
  from: Hex;
  to?: Hex;
  type: string;
  input?: Hex;
  output?: Hex;
  gas?: Hex;
  gasUsed?: Hex;
  value?: Hex;
  error?: string;
  calls?: DebugCallTrace[];
};

/** Action object for a trace_transaction call */
export type TraceAction = {
  from: Hex;
  to?: Hex;
  callType: string;
  gas?: Hex;
  input?: Hex;
  value?: Hex;
};

/** Result object for a trace_transaction call */
export type TraceResult = {
  gasUsed?: Hex;
  output?: Hex;
};

/** Return type for a single trace in trace_transaction response */
export type TraceTransactionResponse = {
  action: TraceAction;
  result?: TraceResult;
  error?: string;
  subtraces: number;
  traceAddress: number[];
  type: string;
};

/** Type for a viem public client with support for debug methods */
export type ViemPublicDebugClient = PublicClient<
  FallbackTransport<HttpTransport[]>,
  Chain,
  undefined,
  [...PublicRpcSchema, ...PublicRpcDebugSchema]
>;

export type ExtendedViemWalletClient = Client<
  FallbackTransport<readonly HttpTransport[]>,
  Chain,
  Account,
  [...PublicRpcSchema, ...WalletRpcSchema],
  PublicActions<FallbackTransport<readonly HttpTransport[]>, Chain> & WalletActions<Chain, Account>
>;

/** Type for a viem client that can be either public or extended with wallet capabilities */
export type ViemClient = ViemPublicClient | ExtendedViemWalletClient;

/** Type for a viem contract that can be used with an extended viem client */
export type ViemContract<TAbi extends Abi> = GetContractReturnType<TAbi, ExtendedViemWalletClient>;

export function isExtendedClient(client: ViemClient): client is ExtendedViemWalletClient {
  return 'account' in client && client.account !== undefined;
}
