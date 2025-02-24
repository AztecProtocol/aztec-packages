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
 *   import { AztecAddress } from '@aztec/aztec.js/addresses';
 *   import { EthAddress } from '@aztec/aztec.js/eth_address';
 * ```
 *
 * TODO: Ultimately reimplement this mega exporter by mega exporting a granular api (then deprecate it).
 */

export { ContractDeployer } from './deployment/index.js';

export { NoteSelector } from '@aztec/circuits.js/abi';

export { createCompatibleClient, createPXEClient } from './rpc_clients/index.js';

export { type AuthWitnessProvider } from './account/index.js';

export { type AccountContract, getAccountContractAddress } from './account/index.js';
export { AccountManager, type DeployAccountOptions } from './account_manager/index.js';

export { AccountWallet, AccountWalletWithSecretKey, SignerlessWallet, type Wallet } from './wallet/index.js';

export { EthAddress } from '@aztec/foundation/eth-address';

export { Fq, Fr, Point, GrumpkinScalar } from '@aztec/foundation/fields';

export {
  type PartialAddress,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  getContractClassFromArtifact,
  getContractInstanceFromDeployParams,
  type NodeInfo,
} from '@aztec/circuits.js/contract';

export { GlobalVariables } from '@aztec/circuits.js/tx';

export { type PublicKey, PublicKeys } from '@aztec/circuits.js/keys';

export { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';

export { computeSecretHash } from '@aztec/circuits.js/hash';

export {
  computeAppNullifierSecretKey,
  deriveKeys,
  deriveMasterIncomingViewingSecretKey,
  deriveMasterNullifierSecretKey,
} from '@aztec/circuits.js/keys';

export { AuthWitness } from '@aztec/circuit-types/auth-witness';

export {
  Body,
  Capsule,
  Comparator,
  ContractClass2BlockL2Logs,
  EncryptedLogPayload,
  EventMetadata,
  ExtendedNote,
  FunctionCall,
  getTimestampRangeForEpoch,
  HashedValues,
  L1Actor,
  L1EventPayload,
  L1NotePayload,
  L1ToL2Message,
  L2Actor,
  L2Block,
  LogId,
  MerkleTreeId,
  merkleTreeIds,
  Note,
  SiblingPath,
  Tx,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
  TxStatus,
  UnencryptedL2Log,
  UniqueNote,
  type LogFilter,
} from '@aztec/circuit-types';

export { type PXE, EventType } from '@aztec/circuit-types/interfaces/client';

// TODO: These kinds of things have no place on our public api.
// External devs will almost certainly have their own methods of doing these things.
// If we want to use them in our own "aztec.js consuming code", import them from foundation as needed.
export { decodeFromAbi, encodeArguments, type AbiType } from '@aztec/circuits.js/abi';
export { toBigIntBE } from '@aztec/foundation/bigint-buffer';
export { sha256, Grumpkin, Schnorr } from '@aztec/foundation/crypto';
export { makeFetch } from '@aztec/foundation/json-rpc/client';
export { retry, retryUntil } from '@aztec/foundation/retry';
export { to2Fields, toBigInt } from '@aztec/foundation/serialize';
export { sleep } from '@aztec/foundation/sleep';
export { elapsed } from '@aztec/foundation/timer';
export { type FieldsOf } from '@aztec/foundation/types';
export { fileURLToPath } from '@aztec/foundation/url';

// Start of section that exports public api via granular api.
// Here you *can* do `export *` as the granular api defacto exports things explicitly.
// This entire index file will be deprecated at some point after we're satisfied.
export * from './api/abi.js';
export * from './api/addresses.js';
export * from './api/cheat_codes.js';
export * from './api/ethereum/index.js';
export * from './api/fee.js';
export * from './api/log.js';
// Granular export, even if not in the api folder
export * from './contract/index.js';
export * from './utils/index.js';
