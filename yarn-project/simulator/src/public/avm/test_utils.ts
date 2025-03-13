import { Fr } from '@aztec/foundation/fields';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';

import type { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { PublicTreesDB } from '../../public/public_db_sources.js';
import type { PublicSideEffectTraceInterface } from '../side_effect_trace_interface.js';

export async function mockGetBytecode(worldStateDB: PublicTreesDB, bytecode: Buffer) {
  const commitment = await computePublicBytecodeCommitment(bytecode);
  (worldStateDB as jest.Mocked<PublicTreesDB>).getBytecodeCommitment.mockResolvedValue(commitment);
}

export function mockTraceFork(trace: PublicSideEffectTraceInterface, nestedTrace?: PublicSideEffectTraceInterface) {
  (trace as jest.Mocked<PublicSideEffectTraceInterface>).fork.mockReturnValue(
    nestedTrace ?? mock<PublicSideEffectTraceInterface>(),
  );
}

export function mockStorageRead(worldStateDB: PublicTreesDB, value: Fr) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).storageRead.mockResolvedValue(value);
}

export function mockNoteHashCount(mockedTrace: PublicSideEffectTraceInterface, count: number) {
  (mockedTrace as jest.Mocked<PublicSideEffectTraceInterface>).getNoteHashCount.mockReturnValue(count);
}

export function mockStorageReadWithMap(worldStateDB: PublicTreesDB, mockedStorage: Map<bigint, Fr>) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).storageRead.mockImplementation((_address, slot) =>
    Promise.resolve(mockedStorage.get(slot.toBigInt()) ?? Fr.ZERO),
  );
}

export function mockGetBytecodeCommitment(worldStateDB: PublicTreesDB, commitment: Fr) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).getBytecodeCommitment.mockResolvedValue(commitment);
}

export function mockNoteHashExists(worldStateDB: PublicTreesDB, _leafIndex: Fr, value?: Fr) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).getCommitmentValue.mockImplementation((index: bigint) => {
    if (index == _leafIndex.toBigInt()) {
      return Promise.resolve(value);
    } else {
      // This is ok for now since the traceing functions handle it
      return Promise.resolve(undefined);
    }
  });
}

export function mockGetNullifierIndex(worldStateDB: PublicTreesDB, leafIndex: Fr, _ignoredValue?: Fr) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).getNullifierIndex.mockResolvedValue(leafIndex.toBigInt());
}

export function mockL1ToL2MessageExists(
  worldStateDB: PublicTreesDB,
  leafIndex: Fr,
  value: Fr,
  valueAtOtherIndices?: Fr,
) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).getL1ToL2LeafValue.mockImplementation((index: bigint) => {
    if (index == leafIndex.toBigInt()) {
      return Promise.resolve(value);
    } else {
      // any indices other than mockAtLeafIndex will return a different value
      // (or undefined if no value is specified for other indices)
      return Promise.resolve(valueAtOtherIndices!);
    }
  });
}

export function mockGetContractInstance(worldStateDB: PublicTreesDB, contractInstance: ContractInstanceWithAddress) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).getContractInstance.mockResolvedValue(contractInstance);
}

export function mockGetContractClass(worldStateDB: PublicTreesDB, contractClass: ContractClassPublic) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).getContractClass.mockResolvedValue(contractClass);
}
