export * from './account/index.js';
export * from './contract/index.js';
export * from './contract_deployer/deploy_method.js';
export * from './contract_deployer/index.js';
export * from './pxe_client.js';
export * from './sandbox/index.js';
export * from './utils/index.js';
export * from './wallet/index.js';

// TODO https://github.com/AztecProtocol/aztec-packages/issues/2632 --> FunctionSelector might not need to be exposed
// here once the issue is resolved.
export {
  AztecAddress,
  CircuitsWasm,
  EthAddress,
  Fr,
  FunctionSelector,
  GlobalVariables,
  GrumpkinScalar,
  Point,
  getContractDeploymentInfo,
} from '@aztec/circuits.js';
export { Grumpkin, Schnorr } from '@aztec/circuits.js/barretenberg';

export {
  AuthWitness,
  AztecNode,
  CompleteAddress,
  ContractData,
  DeployedContract,
  ExtendedContractData,
  ExtendedNote,
  FunctionCall,
  GrumpkinPrivateKey,
  INITIAL_L2_BLOCK_NUM,
  L2Actor,
  L2Block,
  L2BlockL2Logs,
  LogFilter,
  LogType,
  MerkleTreeId,
  NodeInfo,
  Note,
  PXE,
  PackedArguments,
  PartialAddress,
  PublicKey,
  SyncStatus,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
  TxStatus,
  UnencryptedL2Log,
  createAztecNodeClient,
  emptyFunctionCall,
  merkleTreeIds,
  mockTx,
} from '@aztec/types';

export { ContractArtifact, FunctionArtifact, encodeArguments } from '@aztec/foundation/abi';
export { toBigIntBE } from '@aztec/foundation/bigint-buffer';
export * from '@aztec/foundation/crypto';
export { DebugLogger, createDebugLogger, onLog } from '@aztec/foundation/log';
export { retry, retryUntil } from '@aztec/foundation/retry';
export { to2Fields, toBigInt } from '@aztec/foundation/serialize';
export { sleep } from '@aztec/foundation/sleep';
export { elapsed } from '@aztec/foundation/timer';
export { fileURLToPath } from '@aztec/foundation/url';

export {
  DeployL1Contracts,
  L1ContractArtifactsForDeployment,
  deployL1Contract,
  deployL1Contracts,
} from '@aztec/ethereum';

export { FieldsOf } from '@aztec/foundation/types';
