import { Fr } from '@aztec/foundation/fields';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress, type ContractInstance } from '@aztec/stdlib/contract';
import { Note } from '@aztec/stdlib/note';
import { BlockHeader } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import type { ExecutionDataProvider } from '../execution_data_provider.js';

describe('Utility Execution test suite', () => {
  const simulator = new WASMSimulator();

  let executionDataProvider: ReturnType<typeof mock<ExecutionDataProvider>>;
  let acirSimulator: ContractFunctionSimulator;

  beforeEach(() => {
    executionDataProvider = mock<ExecutionDataProvider>();

    executionDataProvider.getBlockNumber.mockResolvedValue(42);
    executionDataProvider.getChainId.mockResolvedValue(1);
    executionDataProvider.getVersion.mockResolvedValue(1);

    acirSimulator = new ContractFunctionSimulator(executionDataProvider, simulator);
  });

  describe('private token contract', () => {
    const ownerSecretKey = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');

    let owner: AztecAddress;

    const buildNote = (amount: bigint, owner: AztecAddress) => {
      return new Note([new Fr(amount), owner.toField(), Fr.random()]);
    };

    beforeEach(async () => {
      const ownerCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(ownerSecretKey, Fr.random());
      owner = ownerCompleteAddress.address;

      executionDataProvider.getCompleteAddress.mockImplementation((account: AztecAddress) => {
        if (account.equals(owner)) {
          return Promise.resolve(ownerCompleteAddress);
        }
        throw new Error(`Unknown address ${account}`);
      });
    });

    it('should run the summed_values function', async () => {
      const contractAddress = await AztecAddress.random();
      const artifact = {
        ...StatefulTestContractArtifact.functions.find(f => f.name === 'summed_values')!,
        contractName: StatefulTestContractArtifact.name,
      };

      const notes: Note[] = [...Array(5).fill(buildNote(1n, owner)), ...Array(2).fill(buildNote(2n, owner))];

      executionDataProvider.getBlockNumber.mockResolvedValue(27);
      executionDataProvider.getPublicStorageAt.mockResolvedValue(Fr.ZERO);
      executionDataProvider.getFunctionArtifact.mockResolvedValue(artifact);
      executionDataProvider.getContractInstance.mockResolvedValue({
        currentContractClassId: new Fr(42),
        originalContractClassId: new Fr(42),
      } as ContractInstance);
      executionDataProvider.syncTaggedLogs.mockResolvedValue();
      executionDataProvider.getBlockHeader.mockResolvedValue(BlockHeader.empty());
      executionDataProvider.getNotes.mockResolvedValue(
        notes.map((note, index) => ({
          contractAddress,
          storageSlot: Fr.random(),
          noteNonce: Fr.random(),
          isSome: new Fr(1),
          note,
          noteHash: Fr.random(),
          siloedNullifier: Fr.random(),
          index: BigInt(index),
        })),
      );

      executionDataProvider.syncTaggedLogs.mockImplementation((_, __) => Promise.resolve());
      executionDataProvider.loadCapsule.mockImplementation((_, __) => Promise.resolve(null));

      const execRequest: FunctionCall = {
        name: artifact.name,
        to: contractAddress,
        selector: FunctionSelector.empty(),
        type: FunctionType.UTILITY,
        isStatic: false,
        args: encodeArguments(artifact, [owner]),
        returnTypes: artifact.returnTypes,
      };

      const result = await acirSimulator.runUtility(execRequest, [], []);

      expect(result).toEqual(9n);
    }, 30_000);
  });
});
