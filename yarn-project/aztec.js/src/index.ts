/**
 * This is our public api.
 * Do NOT "export * from ..." here.
 * Everything here should be explicit, to ensure we can clearly see everything we're exposing to the world.
 * If it's exposed, people will use it, and then we can't remove/change the api without breaking client code.
 * At the time of writing we overexpose things that should only be internal.
 *
 * TODO: Review and narrow scope of public api.
 * We should also consider exposing subsections of the api via package.json exports, like we do with foundation.
 * This can allow consumers to import much smaller parts of the library to incur less overhead.
 * It will also allow web bundlers do perform intelligent chunking of bundles etc.
 * Some work as been done on this within the api folder, providing the alternative import style of e.g.:
 * ```typescript
 *   import { TxHash } from '@aztec.js/tx_hash'
 *   import { type ContractArtifact, type FunctionArtifact, FunctionSelector } from '@aztec/aztec.js/abi';
 *   import { AztecAddress } from '@aztec/aztec.js/aztec_address';
 *   import { EthAddress } from '@aztec/aztec.js/eth_address';
 * ```
 *
 * TODO: Ultimately reimplement this mega exporter by mega exporting a granular api (then deprecate it).
 */
export {
  BatchCall,
  Contract,
  ContractBase,
  ContractFunctionInteraction,
  DefaultWaitOpts,
  DeployMethod,
  DeploySentTx,
  SentTx,
  type ContractMethod,
  type ContractNotes,
  type ContractStorageLayout,
  type DeployOptions,
  type ProfileResult,
  type SendMethodOptions,
  type WaitOpts,
} from './contract/index.js';

export { ContractDeployer } from './deployment/index.js';

export {
  AnvilTestWatcher,
  CheatCodes,
  L1FeeJuicePortalManager,
  L1ToL2TokenPortalManager,
  L1TokenManager,
  L1TokenPortalManager,
  computeAuthWitMessageHash,
  computeInnerAuthWitHash,
  computeInnerAuthWitHashFromAction,
  generateClaimSecret,
  generatePublicKey,
  readFieldCompressedString,
  waitForPXE,
  waitForNode,
  type AztecAddressLike,
  type EthAddressLike,
  type EventSelectorLike,
  type FieldLike,
  type FunctionSelectorLike,
  type L2AmountClaim,
  type L2AmountClaimWithRecipient,
  type L2Claim,
  type WrappedFieldLike,
} from './utils/index.js';

export { NoteSelector } from '@aztec/foundation/abi';

export { createCompatibleClient, createPXEClient } from './rpc_clients/index.js';

export { type AuthWitnessProvider } from './account/index.js';

export { type AccountContract } from './account/index.js';
export { AccountManager, type DeployAccountOptions } from './account_manager/index.js';

export { AccountWallet, AccountWalletWithSecretKey, SignerlessWallet, type Wallet } from './wallet/index.js';

// // TODO https://github.com/AztecProtocol/aztec-packages/issues/2632 --> FunctionSelector might not need to be exposed
// // here once the issue is resolved.
export {
  AztecAddress,
  ContractClassWithId,
  ContractInstanceWithAddress,
  EthAddress,
  Fq,
  Fr,
  GlobalVariables,
  GrumpkinScalar,
  INITIAL_L2_BLOCK_NUM,
  NodeInfo,
  Point,
  PublicKeys,
  getContractClassFromArtifact,
  getContractInstanceFromDeployParams,
} from '@aztec/circuits.js';

export { computeSecretHash } from '@aztec/circuits.js/hash';

export {
  computeAppNullifierSecretKey,
  deriveKeys,
  deriveMasterIncomingViewingSecretKey,
  deriveMasterNullifierSecretKey,
} from '@aztec/circuits.js/keys';

export { Grumpkin, Schnorr } from '@aztec/circuits.js/barretenberg';

export {
  AuthWitness,
  Body,
  Comparator,
  CompleteAddress,
  ContractClass2BlockL2Logs,
  EncryptedLogPayload,
  EpochProofQuote,
  EpochProofQuotePayload,
  EventMetadata,
  EventType,
  ExtendedNote,
  FunctionCall,
  L1Actor,
  L1EventPayload,
  L1NotePayload,
  L1ToL2Message,
  L2Actor,
  L2Block,
  LogId,
  MerkleTreeId,
  Note,
  PackedValues,
  SiblingPath,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
  TxStatus,
  UnencryptedL2BlockL2Logs,
  UnencryptedL2Log,
  UniqueNote,
  createAztecNodeClient,
  getTimestampRangeForEpoch,
  merkleTreeIds,
  mockEpochProofQuote,
  mockTx,
  type AztecNode,
  type EpochConstants,
  type LogFilter,
  type PXE,
  type PartialAddress,
  type PublicKey,
  type SyncStatus,
} from '@aztec/circuit-types';

// TODO: These kinds of things have no place on our public api.
// External devs will almost certainly have their own methods of doing these things.
// If we want to use them in our own "aztec.js consuming code", import them from foundation as needed.
export { decodeFromAbi, encodeArguments, type AbiType } from '@aztec/foundation/abi';
export { toBigIntBE } from '@aztec/foundation/bigint-buffer';
export { sha256 } from '@aztec/foundation/crypto';
export { makeFetch } from '@aztec/foundation/json-rpc/client';
export { createDebugLogger, type DebugLogger } from '@aztec/foundation/log';
export { retry, retryUntil } from '@aztec/foundation/retry';
export { to2Fields, toBigInt } from '@aztec/foundation/serialize';
export { sleep } from '@aztec/foundation/sleep';
export { elapsed } from '@aztec/foundation/timer';
export { type FieldsOf } from '@aztec/foundation/types';
export { fileURLToPath } from '@aztec/foundation/url';

export { EthCheatCodes, deployL1Contract, deployL1Contracts, type DeployL1Contracts } from '@aztec/ethereum';

// Start of section that exports public api via granular api.
// Here you *can* do `export *` as the granular api defacto exports things explicitly.
// This entire index file will be deprecated at some point after we're satisfied.
export * from './api/abi.js';
export * from './api/fee.js';
export * from './api/init.js';
