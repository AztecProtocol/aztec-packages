import type { CompleteAddress, ContractArtifact, ContractInstanceWithAddress, TxHash } from '@aztec/aztec.js';
import type { Fr } from '@aztec/foundation/fields';
import { TypedOracle } from '@aztec/pxe/simulator';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PrivateContextInputs } from '@aztec/stdlib/kernel';
import type { UInt32, UInt64 } from '@aztec/stdlib/types';

class OracleMethodNotAvailableError extends Error {
  constructor(className: string, methodName: string) {
    super(`Oracle method ${methodName} is not implemented in handler ${className}.`);
  }
}

export class TXETypedOracle extends TypedOracle {
  avmOpcodeAddress(): Promise<AztecAddress> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeAddress');
  }

  avmOpcodeBlockNumber(): Promise<UInt32> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeBlockNumber');
  }

  avmOpcodeTimestamp(): Promise<bigint> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeTimestamp');
  }

  avmOpcodeIsStaticCall(): Promise<boolean> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeIsStaticCall');
  }

  avmOpcodeChainId(): Promise<Fr> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeChainId');
  }

  avmOpcodeVersion(): Promise<Fr> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeVersion');
  }

  avmOpcodeEmitNullifier(_nullifier: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeEmitNullifier');
  }

  avmOpcodeEmitNoteHash(_noteHash: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeEmitNoteHash');
  }

  avmOpcodeNullifierExists(_innerNullifier: Fr, _targetAddress: AztecAddress): Promise<boolean> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeNullifierExists');
  }

  avmOpcodeStorageWrite(_slot: Fr, _value: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeStorageWrite');
  }

  avmOpcodeStorageRead(_slot: Fr): Promise<Fr> {
    throw new OracleMethodNotAvailableError(this.className, 'avmOpcodeStorageRead');
  }

  txeGetPrivateContextInputs(_blockNumber?: number): Promise<PrivateContextInputs> {
    throw new OracleMethodNotAvailableError(this.className, 'txeGetPrivateContextInputs');
  }

  txeGetNextBlockNumber(): Promise<number> {
    throw new OracleMethodNotAvailableError(this.className, 'txeGetNextBlockNumber');
  }

  txeGetNextBlockTimestamp(): Promise<UInt64> {
    throw new OracleMethodNotAvailableError(this.className, 'txeGetNextBlockTimestamp');
  }

  txeAdvanceBlocksBy(_blocks: number): Promise<void> {
    throw new OracleMethodNotAvailableError(this.className, 'txeAdvanceBlocksBy');
  }

  txeAdvanceTimestampBy(_duration: UInt64) {
    throw new OracleMethodNotAvailableError(this.className, 'txeAdvanceTimestampBy');
  }

  txeDeploy(_artifact: ContractArtifact, _instance: ContractInstanceWithAddress, _foreignSecret: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError(this.className, 'txeDeploy');
  }

  txeCreateAccount(_secret: Fr): Promise<CompleteAddress> {
    throw new OracleMethodNotAvailableError(this.className, 'txeCreateAccount');
  }

  txeAddAccount(
    _artifact: ContractArtifact,
    _instance: ContractInstanceWithAddress,
    _secret: Fr,
  ): Promise<CompleteAddress> {
    throw new OracleMethodNotAvailableError(this.className, 'txeAddAccount');
  }

  txeAddAuthWitness(_address: AztecAddress, _messageHash: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError(this.className, 'txeAddAuthWitness');
  }

  txeGetLastBlockTimestamp(): Promise<bigint> {
    throw new OracleMethodNotAvailableError(this.className, 'txeGetLastBlockTimestamp');
  }

  txeGetLastTxEffects(): Promise<{
    txHash: TxHash;
    noteHashes: Fr[];
    nullifiers: Fr[];
  }> {
    throw new OracleMethodNotAvailableError(this.className, 'txeGetLastTxEffects');
  }

  storageWrite(_startStorageSlot: Fr, _values: Fr[]): Promise<Fr[]> {
    throw new OracleMethodNotAvailableError(this.className, 'storageWrite');
  }

  getMsgSender(): AztecAddress {
    throw new OracleMethodNotAvailableError(this.className, 'getMsgSender');
  }

  txePrivateCallNewFlow(
    _from: AztecAddress,
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _args: Fr[],
    _argsHash: Fr,
    _isStaticCall: boolean,
  ): Promise<Fr[]> {
    throw new OracleMethodNotAvailableError(this.className, 'txePrivateCallNewFlow');
  }

  txeSimulateUtilityFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _args: Fr[],
  ): Promise<Fr[]> {
    throw new OracleMethodNotAvailableError(this.className, 'simulateUtilityFunction');
  }

  txePublicCallNewFlow(
    _from: AztecAddress,
    _targetContractAddress: AztecAddress,
    _calldata: Fr[],
    _isStaticCall: boolean,
  ): Promise<Fr[]> {
    throw new OracleMethodNotAvailableError(this.className, 'txePublicCallNewFlow');
  }
}
