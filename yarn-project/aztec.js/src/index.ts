export * from './contract/index.js';
export * from './contract_deployer/index.js';
export * from './utils/index.js';
export * from './aztec_rpc_client/index.js';
export * from './account_impl/index.js';
export * from './contract_deployer/deploy_method.js';

// TODO - only export necessary stuffs
// export * from '@aztec/aztec-rpc';

export { AztecAddress, EthAddress, Point, Fr } from '@aztec/circuits.js';
export {
  AztecRPC,
  ContractData,
  ContractDeploymentTx,
  ContractPublicData,
  DeployedContract,
  FunctionCall,
  L2BlockL2Logs,
  NodeInfo,
  PackedArguments,
  PublicKey,
  PrivateKey,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
  TxStatus,
  emptyFunctionCall,
} from '@aztec/types';

export { createDebugLogger } from '@aztec/foundation/log';
