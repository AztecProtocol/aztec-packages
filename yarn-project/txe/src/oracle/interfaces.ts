import type { ContractArtifact } from '@aztec/aztec.js/abi';
import { CompleteAddress } from '@aztec/aztec.js/addresses';
import type { ContractInstanceWithAddress } from '@aztec/aztec.js/contracts';
import { TxHash } from '@aztec/aztec.js/tx';
import { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EventSelector, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { PrivateLog } from '@aztec/stdlib/logs';
import type { UInt64 } from '@aztec/stdlib/types';

// These interfaces complement the ones defined in PXE, and combined with those contain the full list of oracles used by
// aztec-nr. In particular, these include the ones needed to run Brillig code associated to #[external("public")] functions that has
// not been transpiled (e.g. in the context of a Noir test) as well as the ones associated with managing the state of
// such a Noir test (deploying contracts, manipulating block time, making calls, etc) - the so called 'top level test
// context'.

/**
 * Oracle methods associated with the execution of an Aztec #[external("public")] function.
 *
 * Note that real contracts have their Brillig calls to these be transpiled into opcodes, the oracles are only executed
 * as such when running the original Brillig code, e.g. when invoking functions that interact with a PublicContext
 * directly in a Noir test.
 */
export interface IAvmExecutionOracle {
  isAvm: true;

  address(): Promise<AztecAddress>;
  sender(): Promise<AztecAddress>;
  blockNumber(): Promise<BlockNumber>;
  timestamp(): Promise<bigint>;
  isStaticCall(): Promise<boolean>;
  chainId(): Promise<Fr>;
  version(): Promise<Fr>;
  emitNullifier(nullifier: Fr): Promise<void>;
  emitNoteHash(noteHash: Fr): Promise<void>;
  nullifierExists(siloedNullifier: Fr): Promise<boolean>;
  storageWrite(slot: Fr, value: Fr): Promise<void>;
  storageRead(slot: Fr, contractAddress: AztecAddress): Promise<Fr>;
  returndataSize(): Promise<Fr>;
  returndataCopy(rdOffset: number, copySize: number): Promise<Fr[]>;
  call(l2Gas: number, daGas: number, address: AztecAddress, argsLength: number, args: Fr[]): Promise<Fr[]>;
  staticCall(l2Gas: number, daGas: number, address: AztecAddress, argsLength: number, args: Fr[]): Promise<Fr[]>;
  successCopy(): Promise<Fr>;
}

/**
 * Oracle methods associated with the execution of an Aztec Noir test.
 */
export interface ITxeExecutionOracle {
  isTxe: true;

  getDefaultAddress(): AztecAddress;
  getNextBlockNumber(): Promise<BlockNumber>;
  getNextBlockTimestamp(): Promise<UInt64>;
  advanceBlocksBy(blocks: number): Promise<void>;
  advanceTimestampBy(duration: UInt64): void;
  deploy(artifact: ContractArtifact, instance: ContractInstanceWithAddress, foreignSecret: Fr): Promise<void>;
  createAccount(secret: Fr): Promise<CompleteAddress>;
  addAccount(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: Fr): Promise<CompleteAddress>;
  addAuthWitness(address: AztecAddress, messageHash: Fr): Promise<void>;
  getLastBlockTimestamp(): Promise<bigint>;
  getLastTxEffects(): Promise<{
    txHash: TxHash;
    noteHashes: Fr[];
    nullifiers: Fr[];
    privateLogs: PrivateLog[];
  }>;
  getPrivateEvents(selector: EventSelector, contractAddress: AztecAddress, scope: AztecAddress): Promise<Fr[][]>;
  privateCallNewFlow(
    from: AztecAddress | undefined,
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
    argsHash: Fr,
    isStaticCall: boolean,
    additionalScopes: AztecAddress[],
    jobId: string,
    authorizedUtilityCallTargets: AztecAddress[],
    gasSettings: GasSettings,
  ): Promise<{ returnValues: Fr[]; offchainEffects: Fr[][] }>;
  executeUtilityFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
    jobId: string,
    authorizedUtilityCallTargets: AztecAddress[],
  ): Promise<Fr[]>;
  publicCallNewFlow(
    from: AztecAddress | undefined,
    targetContractAddress: AztecAddress,
    calldata: Fr[],
    isStaticCall: boolean,
    gasSettings: GasSettings,
  ): Promise<Fr[]>;
  // TODO(F-335): Drop this from here as it's not a real oracle handler - it's only called from
  // RPCTranslator::txeGetPrivateEvents and never from Noir.
  syncContractNonOracleMethod(contractAddress: AztecAddress, scope: AztecAddress, jobId: string): Promise<void>;
}
