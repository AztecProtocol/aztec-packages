import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import type { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { PublicContractsDB, PublicTreesDB } from '../public_db_sources.js';
import type { PublicSideEffectTraceInterface } from '../side_effect_trace_interface.js';

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

export function mockGetNoteHash(worldStateDB: PublicTreesDB, _leafIndex: bigint, value?: Fr) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).getNoteHash.mockImplementation((index: bigint) => {
    if (index == _leafIndex && value) {
      return Promise.resolve(value);
    } else {
      return Promise.resolve(Fr.ZERO);
    }
  });
}

export function mockCheckNullifierExists(worldStateDB: PublicTreesDB, exists: boolean, _ignoredValue?: Fr) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).checkNullifierExists.mockResolvedValue(exists);
}

export function mockGetL1ToL2LeafValue(worldStateDB: PublicTreesDB, leafIndex: bigint, value?: Fr) {
  (worldStateDB as jest.Mocked<PublicTreesDB>).getL1ToL2LeafValue.mockImplementation((index: bigint) => {
    if (index == leafIndex && value) {
      return Promise.resolve(value);
    } else {
      return Promise.resolve(Fr.ZERO!);
    }
  });
}

export function mockGetContractInstance(contractsDB: PublicContractsDB, contractInstance: ContractInstanceWithAddress) {
  (contractsDB as jest.Mocked<PublicContractsDB>).getContractInstance.mockResolvedValue(contractInstance);
}

export function mockGetContractClass(contractsDB: PublicContractsDB, contractClass: ContractClassPublic) {
  (contractsDB as jest.Mocked<PublicContractsDB>).getContractClass.mockResolvedValue(contractClass);
}

export function mockGetBytecodeCommitment(contractsDB: PublicContractsDB, commitment: Fr) {
  (contractsDB as jest.Mocked<PublicContractsDB>).getBytecodeCommitment.mockResolvedValue(commitment);
}
