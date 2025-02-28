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

export { NoteSelector } from '@aztec/stdlib/abi';

export { createCompatibleClient, createPXEClient } from './rpc_clients/index.js';

export { type DeployAccountOptions } from './account_manager/index.js';

export { AccountWallet, AccountWalletWithSecretKey, SignerlessWallet } from './wallet/index.js';

export { EthAddress } from '@aztec/foundation/eth-address';

export { Fq, Fr, Point, GrumpkinScalar } from '@aztec/foundation/fields';

export { SiblingPath } from '@aztec/foundation/trees';

export { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';

export {
  type PartialAddress,
  type ContractClassWithId,
  type ContractInstanceWithAddress,
  getContractClassFromArtifact,
  getContractInstanceFromDeployParams,
  type NodeInfo,
} from '@aztec/stdlib/contract';
export { MerkleTreeId, merkleTreeIds } from '@aztec/stdlib/trees';
export { type PublicKey, PublicKeys } from '@aztec/stdlib/keys';
export { computeSecretHash } from '@aztec/stdlib/hash';
export {
  computeAppNullifierSecretKey,
  deriveKeys,
  deriveMasterIncomingViewingSecretKey,
  deriveMasterNullifierSecretKey,
} from '@aztec/stdlib/keys';
export { AuthWitness } from '@aztec/stdlib/auth-witness';
export { getTimestampRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
export { FunctionCall } from '@aztec/stdlib/abi';
export {
  Tx,
  TxExecutionRequest,
  TxHash,
  TxReceipt,
  TxStatus,
  Capsule,
  HashedValues,
  GlobalVariables,
} from '@aztec/stdlib/tx';
export { Body, L2Block } from '@aztec/stdlib/block';
export { L1NotePayload, LogId, type LogFilter, EncryptedLogPayload } from '@aztec/stdlib/logs';
export { L1EventPayload, EventMetadata } from '@aztec/stdlib/event';
export { L1ToL2Message, L2Actor, L1Actor } from '@aztec/stdlib/messaging';
export { UniqueNote, ExtendedNote, Comparator, Note } from '@aztec/stdlib/note';
export { type PXE, EventType } from '@aztec/stdlib/interfaces/client';

// TODO: These kinds of things have no place on our public api.
// External devs will almost certainly have their own methods of doing these things.
// If we want to use them in our own "aztec.js consuming code", import them from foundation as needed.
export { decodeFromAbi, encodeArguments, type AbiType } from '@aztec/stdlib/abi';
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
export * from './api/account.js';
export * from './api/addresses.js';
export * from './api/cheat_codes.js';
export * from './api/ethereum/index.js';
export * from './api/fee.js';
export * from './api/log.js';
// Granular export, even if not in the api folder
export * from './contract/index.js';
export * from './utils/index.js';
