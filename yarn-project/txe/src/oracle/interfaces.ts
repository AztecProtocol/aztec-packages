import type { CompleteAddress, ContractArtifact, ContractInstanceWithAddress, TxHash } from '@aztec/aztec.js';
import type { Fr } from '@aztec/foundation/fields';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { UInt32, UInt64 } from '@aztec/stdlib/types';

// These interfaces complement the ones defined in PXE, and combined with those contain the full list of oracles used by
// aztec-nr. In particular, these include the ones needed to run Brillig code associated to #[public] functions that has
// not been transpiled (e.g. in the context of a Noir test) as well as the ones associated with managing the state of
// such a Noir test (deploying contracts, manipulating block time, making calls, etc) - the so called 'top level test
// context'.

/**
 * Oracle methods associated with the execution of an Aztec #[public] function.
 *
 * Note that real contracts have their Brillig calls to these be transpiled into opcodes, the oracles are only executed
 * as such when running the original Brillig code, e.g. when invoking functions that interact with a PublicContext
 * directly in a Noir test.
 */
export interface IAvmExecutionOracle {
  isAvm: true;

  avmOpcodeAddress(): Promise<AztecAddress>;
  avmOpcodeSender(): Promise<AztecAddress>;
  avmOpcodeBlockNumber(): Promise<UInt32>;
  avmOpcodeTimestamp(): Promise<bigint>;
  avmOpcodeIsStaticCall(): Promise<boolean>;
  avmOpcodeChainId(): Promise<Fr>;
  avmOpcodeVersion(): Promise<Fr>;
  avmOpcodeEmitNullifier(nullifier: Fr): Promise<void>;
  avmOpcodeEmitNoteHash(noteHash: Fr): Promise<void>;
  avmOpcodeNullifierExists(innerNullifier: Fr, targetAddress: AztecAddress): Promise<boolean>;
  avmOpcodeStorageWrite(slot: Fr, value: Fr): Promise<void>;
  avmOpcodeStorageRead(slot: Fr): Promise<Fr>;
}

/**
 * Oracle methods associated with the execution of an Aztec Noir test.
 */
export interface ITxeExecutionOracle {
  isTxe: true;

  txeGetNextBlockNumber(): Promise<number>;
  txeGetNextBlockTimestamp(): Promise<UInt64>;
  txeAdvanceBlocksBy(blocks: number): Promise<void>;
  txeAdvanceTimestampBy(duration: UInt64): void;
  txeDeploy(artifact: ContractArtifact, instance: ContractInstanceWithAddress, foreignSecret: Fr): Promise<void>;
  txeCreateAccount(secret: Fr): Promise<CompleteAddress>;
  txeAddAccount(
    artifact: ContractArtifact,
    instance: ContractInstanceWithAddress,
    secret: Fr,
  ): Promise<CompleteAddress>;
  txeAddAuthWitness(address: AztecAddress, messageHash: Fr): Promise<void>;
  txeGetLastBlockTimestamp(): Promise<bigint>;
  txeGetLastTxEffects(): Promise<{
    txHash: TxHash;
    noteHashes: Fr[];
    nullifiers: Fr[];
  }>;
  txePrivateCallNewFlow(
    from: AztecAddress,
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
    argsHash: Fr,
    isStaticCall: boolean,
  ): Promise<Fr[]>;
  txeSimulateUtilityFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
  ): Promise<Fr[]>;
  txePublicCallNewFlow(
    from: AztecAddress,
    targetContractAddress: AztecAddress,
    calldata: Fr[],
    isStaticCall: boolean,
  ): Promise<Fr[]>;
}
