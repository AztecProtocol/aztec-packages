import type { CompleteAddress, ContractArtifact, ContractInstanceWithAddress, TxHash } from '@aztec/aztec.js';
import type { Fr } from '@aztec/foundation/fields';
import { TypedOracle } from '@aztec/pxe/simulator';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PrivateContextInputs } from '@aztec/stdlib/kernel';
import type { UInt32, UInt64 } from '@aztec/stdlib/types';

class OracleMethodNotAvailableError extends Error {
  constructor(methodName: string) {
    super(`Oracle method ${methodName} is not available.`);
  }
}

export class TXETypedOracle extends TypedOracle {
  avmOpcodeAddress(): Promise<AztecAddress> {
    throw new OracleMethodNotAvailableError('avmOpcodeAddress');
  }

  avmOpcodeBlockNumber(): Promise<UInt32> {
    throw new OracleMethodNotAvailableError('avmOpcodeBlockNumber');
  }

  avmOpcodeTimestamp(): Promise<bigint> {
    throw new OracleMethodNotAvailableError('avmOpcodeTimestamp');
  }

  avmOpcodeIsStaticCall(): Promise<boolean> {
    throw new OracleMethodNotAvailableError('avmOpcodeIsStaticCall');
  }

  avmOpcodeChainId(): Promise<Fr> {
    throw new OracleMethodNotAvailableError('avmOpcodeChainId');
  }

  avmOpcodeVersion(): Promise<Fr> {
    throw new OracleMethodNotAvailableError('avmOpcodeVersion');
  }

  avmOpcodeEmitNullifier(_nullifier: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError('avmOpcodeEmitNullifier');
  }

  avmOpcodeEmitNoteHash(_noteHash: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError('avmOpcodeEmitNoteHash');
  }

  avmOpcodeNullifierExists(_innerNullifier: Fr, _targetAddress: AztecAddress): Promise<boolean> {
    throw new OracleMethodNotAvailableError('avmOpcodeNullifierExists');
  }

  avmOpcodeStorageWrite(_slot: Fr, _value: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError('avmOpcodeStorageWrite');
  }

  avmOpcodeStorageRead(_slot: Fr): Promise<Fr> {
    throw new OracleMethodNotAvailableError('avmOpcodeStorageRead');
  }

  txeGetPrivateContextInputs(_blockNumber?: number): Promise<PrivateContextInputs> {
    throw new OracleMethodNotAvailableError('txeGetPrivateContextInputs');
  }

  txeAdvanceBlocksBy(_blocks: number): Promise<void> {
    throw new OracleMethodNotAvailableError('txeAdvanceBlocksBy');
  }

  txeAdvanceTimestampBy(_duration: UInt64) {
    throw new OracleMethodNotAvailableError('txeAdvanceTimestampBy');
  }

  txeSetContractAddress(_contractAddress: AztecAddress) {
    throw new OracleMethodNotAvailableError('txeSetContractAddress');
  }

  txeDeploy(_artifact: ContractArtifact, _instance: ContractInstanceWithAddress, _foreignSecret: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError('txeDeploy');
  }

  txeCreateAccount(_secret: Fr): Promise<CompleteAddress> {
    throw new OracleMethodNotAvailableError('txeCreateAccount');
  }

  txeAddAccount(
    _artifact: ContractArtifact,
    _instance: ContractInstanceWithAddress,
    _secret: Fr,
  ): Promise<CompleteAddress> {
    throw new OracleMethodNotAvailableError('txeAddAccount');
  }

  txeAddAuthWitness(_address: AztecAddress, _messageHash: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError('txeAddAuthWitness');
  }

  txeGetLastBlockTimestamp(): Promise<bigint> {
    throw new OracleMethodNotAvailableError('txeGetLastBlockTimestamp');
  }

  storageWrite(_startStorageSlot: Fr, _values: Fr[]): Promise<Fr[]> {
    throw new OracleMethodNotAvailableError('storageWrite');
  }

  getMsgSender(): AztecAddress {
    throw new OracleMethodNotAvailableError('getMsgSender');
  }

  txePrivateCallNewFlow(
    _from: AztecAddress,
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _args: Fr[],
    _argsHash: Fr,
    _isStaticCall: boolean,
  ): Promise<{
    endSideEffectCounter: Fr;
    returnsHash: Fr;
    txHash: TxHash;
  }> {
    throw new OracleMethodNotAvailableError('txePrivateCallNewFlow');
  }

  simulateUtilityFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
  ): Promise<Fr> {
    throw new OracleMethodNotAvailableError('simulateUtilityFunction');
  }

  txePublicCallNewFlow(
    _from: AztecAddress,
    _targetContractAddress: AztecAddress,
    _calldata: Fr[],
    _isStaticCall: boolean,
  ): Promise<{
    returnsHash: Fr;
    txHash: TxHash;
  }> {
    throw new OracleMethodNotAvailableError('txePublicCallNewFlow');
  }
}
