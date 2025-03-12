import { Fr } from '@aztec/foundation/fields';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import type { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import type { PublicContractsDB, PublicTreesDB } from '../../public/public_db_sources.js';
import type { PublicSideEffectTraceInterface } from '../side_effect_trace_interface.js';

export function mockTraceFork(trace: PublicSideEffectTraceInterface, nestedTrace?: PublicSideEffectTraceInterface) {
  (trace as jest.Mocked<PublicSideEffectTraceInterface>).fork.mockReturnValue(
    nestedTrace ?? mock<PublicSideEffectTraceInterface>(),
  );
}

export function mockStorageRead(publicTreesDb: PublicTreesDB, value: Fr) {
  (publicTreesDb as jest.Mocked<PublicTreesDB>).storageRead.mockResolvedValue(value);
}

export function mockNoteHashCount(mockedTrace: PublicSideEffectTraceInterface, count: number) {
  (mockedTrace as jest.Mocked<PublicSideEffectTraceInterface>).getNoteHashCount.mockReturnValue(count);
}

export function mockStorageReadWithMap(publicTreesDb: PublicTreesDB, mockedStorage: Map<bigint, Fr>) {
  (publicTreesDb as jest.Mocked<PublicTreesDB>).storageRead.mockImplementation((_address, slot) =>
    Promise.resolve(mockedStorage.get(slot.toBigInt()) ?? Fr.ZERO),
  );
}

export function mockGetNoteHash(publicTreesDb: PublicTreesDB, value?: Fr) {
  (publicTreesDb as jest.Mocked<PublicTreesDB>).getNoteHash.mockResolvedValueOnce(value);
}

export function mockGetNoteHashIfIndexMatches(publicTreesDb: PublicTreesDB, leafIndex: Fr, value: Fr) {
  (publicTreesDb as jest.Mocked<PublicTreesDB>).getNoteHash.mockImplementation((index: bigint) => {
    if (index == leafIndex.toBigInt()) {
      return Promise.resolve(value);
    } else {
      // This is ok for now since the tracing functions handle it
      return Promise.resolve(undefined);
    }
  });
}

export function mockCheckNullifierExists(publicTreesDb: PublicTreesDB, exists: boolean) {
  (publicTreesDb as jest.Mocked<PublicTreesDB>).checkNullifierExists.mockResolvedValue(exists);
}

export function mockL1ToL2MessageExists(
  publicTreesDb: PublicTreesDB,
  leafIndex: Fr,
  value: Fr,
  valueAtOtherIndices?: Fr,
) {
  (publicTreesDb as jest.Mocked<PublicTreesDB>).getL1ToL2LeafValue.mockImplementation((index: bigint) => {
    if (index == leafIndex.toBigInt()) {
      return Promise.resolve(value);
    } else {
      // any indices other than mockAtLeafIndex will return a different value
      // (or undefined if no value is specified for other indices)
      return Promise.resolve(valueAtOtherIndices!);
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
