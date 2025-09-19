import { Fr } from '@aztec/foundation/fields';
import { OracleVersionCheckContractArtifact } from '@aztec/noir-test-contracts.js/OracleVersionCheck';
import { WASMSimulator } from '@aztec/simulator/client';
import { FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstance } from '@aztec/stdlib/contract';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';
import { BlockHeader, HashedValues, TxContext, TxExecutionRequest } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import type { ExecutionDataProvider } from '../execution_data_provider.js';

describe('Oracle Version Check test suite', () => {
  const simulator = new WASMSimulator();

  let executionDataProvider: ReturnType<typeof mock<ExecutionDataProvider>>;
  let acirSimulator: ContractFunctionSimulator;
  let contractAddress: AztecAddress;

  beforeEach(async () => {
    executionDataProvider = mock<ExecutionDataProvider>();

    // Mock basic oracle responses
    executionDataProvider.getPublicStorageAt.mockResolvedValue(Fr.ZERO);
    executionDataProvider.loadCapsule.mockImplementation((_, __) => Promise.resolve(null));
    executionDataProvider.getAnchorBlockHeader.mockResolvedValue(BlockHeader.empty());
    executionDataProvider.getContractInstance.mockResolvedValue({
      currentContractClassId: new Fr(42),
      originalContractClassId: new Fr(42),
    } as ContractInstance);

    acirSimulator = new ContractFunctionSimulator(executionDataProvider, simulator);
    contractAddress = await AztecAddress.random();
  });

  describe('private function execution', () => {
    it('should call assertCompatibleOracleVersion oracle when private function is called', async () => {
      // Load the artifact of the OracleVersionCheck::private_function contract function and set up the relevant oracle handler
      const privateFunctionArtifact = {
        ...OracleVersionCheckContractArtifact.functions.find(f => f.name === 'private_function')!,
        contractName: OracleVersionCheckContractArtifact.name,
      };
      executionDataProvider.getFunctionArtifact.mockResolvedValue(privateFunctionArtifact);

      // Form the execution request for the private function
      const selector = await FunctionSelector.fromNameAndParameters(
        'private_function',
        privateFunctionArtifact.parameters,
      );
      const hashedArguments = await HashedValues.fromArgs(encodeArguments(privateFunctionArtifact, []));
      const txRequest = TxExecutionRequest.from({
        origin: contractAddress,
        firstCallArgsHash: hashedArguments.hash,
        functionSelector: selector,
        txContext: TxContext.from({
          chainId: new Fr(10),
          version: new Fr(20),
          gasSettings: GasSettings.default({ maxFeesPerGas: new GasFees(10, 10) }),
        }),
        argsOfCalls: [hashedArguments],
        authWitnesses: [],
        capsules: [],
        salt: Fr.random(),
      });

      // Call the private function with arbitrary message sender and sender for tags
      const msgSender = await AztecAddress.random();
      const senderForTags = await AztecAddress.random();
      await acirSimulator.run(txRequest, contractAddress, selector, msgSender, senderForTags);

      expect(executionDataProvider.assertCompatibleOracleVersion).toHaveBeenCalledTimes(1);
    }, 30_000);
  });

  describe('utility function execution', () => {
    it('should call assertCompatibleOracleVersion oracle when utility function is called', async () => {
      // Load the artifact of the OracleVersionCheck::utility_function contract function and set up the relevant oracle
      // handler
      const utilityFunctionArtifact = {
        ...OracleVersionCheckContractArtifact.functions.find(f => f.name === 'utility_function')!,
        contractName: OracleVersionCheckContractArtifact.name,
      };
      executionDataProvider.getFunctionArtifact.mockResolvedValue(utilityFunctionArtifact);

      // Form the execution request for the utility function
      const execRequest: FunctionCall = {
        name: utilityFunctionArtifact.name,
        to: contractAddress,
        selector: FunctionSelector.empty(),
        type: FunctionType.UTILITY,
        isStatic: false,
        args: encodeArguments(utilityFunctionArtifact, []),
        returnTypes: utilityFunctionArtifact.returnTypes,
      };

      // Call the utility function
      await acirSimulator.runUtility(execRequest, [], []);

      expect(executionDataProvider.assertCompatibleOracleVersion).toHaveBeenCalledTimes(1);
    }, 30_000);
  });
});
