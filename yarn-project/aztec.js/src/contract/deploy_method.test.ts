import { jest } from '@jest/globals';
import { type ContractArtifact, type FunctionArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { ContractClassId } from '@aztec/foundation/types';
import { PublicKeys } from '@aztec/stdlib/keys';

import { DeployMethod } from './deploy_method.js';
import { Contract } from './contract.js';

// Mock necessary dependencies
jest.mock('../deployment/register_class.js', () => ({
  registerContractClass: jest.fn(() => ({
    request: () => ({}),
    getCapsules: () => [],
  })),
}));

jest.mock('../deployment/deploy_instance.js', () => ({
  deployInstance: jest.fn(() => ({
    request: () => ({}),
    getCapsules: () => [],
  })),
}));

describe('DeployMethod', () => {
  let deployMethod: DeployMethod;
  let mockWallet: any;
  let mockArtifact: any;

  beforeEach(() => {
    // Create mocks for all necessary dependencies
    mockWallet = {
      getAddress: jest.fn(() => new AztecAddress(Buffer.alloc(32, 1))),
      getContractClassMetadata: jest.fn(() => ({ isContractClassPubliclyRegistered: false })),
      registerContract: jest.fn(() => Promise.resolve()),
      log: { debug: jest.fn(), info: jest.fn() },
    };

    mockArtifact = {
      name: 'TestContract',
      functions: [],
    };

    // Create an instance of DeployMethod
    deployMethod = new DeployMethod(
      PublicKeys.default(),
      mockWallet as any,
      mockArtifact,
      async (address: AztecAddress) => Contract.at(address, mockArtifact, mockWallet),
      [],
    );

    // Override internal methods
    (deployMethod as any).getInstance = jest.fn(() => ({
      address: new AztecAddress(Buffer.alloc(32, 1)),
      currentContractClassId: new ContractClassId(new Fr(1)),
      salt: new Fr(1),
      publicKeys: PublicKeys.default(),
      deployer: new AztecAddress(Buffer.alloc(32, 1)),
      initializationHash: new Fr(1),
    }));

    (deployMethod as any).log = { debug: jest.fn(), info: jest.fn() };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDeploymentFunctionCalls', () => {
    it('should skip registration and deployment for contracts with no public functions', async () => {
      // Contract without public functions
      mockArtifact.functions = [
        { name: 'test', isPublic: false } as FunctionArtifact,
      ];

      // Call the method
      const result = await (deployMethod as any).getDeploymentFunctionCalls();

      // Check the result
      expect(result.calls.length).toBe(0);
      expect(result.capsules.length).toBe(0);
      expect((deployMethod as any).log.info).toHaveBeenCalled();
    });

    it('should register and deploy contracts with public functions', async () => {
      // Contract with public functions
      mockArtifact.functions = [
        { name: 'test', isPublic: true } as FunctionArtifact,
      ];

      // Call the method
      const result = await (deployMethod as any).getDeploymentFunctionCalls();

      // Check the result
      expect(result.calls.length).toBe(2); // Calls for class registration and instance deployment
    });

    it('should skip registration for already registered contract classes', async () => {
      // Contract with public functions
      mockArtifact.functions = [
        { name: 'test', isPublic: true } as FunctionArtifact,
      ];

      // Contract class is already registered
      mockWallet.getContractClassMetadata = jest.fn(() => ({ isContractClassPubliclyRegistered: true }));

      // Call the method
      const result = await (deployMethod as any).getDeploymentFunctionCalls();

      // Check the result
      expect(result.calls.length).toBe(1); // Only instance deployment call
    });

    it('should respect skipPublicDeployment option', async () => {
      // Contract with public functions
      mockArtifact.functions = [
        { name: 'test', isPublic: true } as FunctionArtifact,
      ];

      // Call the method with skipPublicDeployment option
      const result = await (deployMethod as any).getDeploymentFunctionCalls({ skipPublicDeployment: true });

      // Check the result
      expect(result.calls.length).toBe(0);
    });

    it('should respect skipClassRegistration option', async () => {
      // Contract with public functions
      mockArtifact.functions = [
        { name: 'test', isPublic: true } as FunctionArtifact,
      ];

      // Call the method with skipClassRegistration option
      const result = await (deployMethod as any).getDeploymentFunctionCalls({ skipClassRegistration: true });

      // Check the result
      expect(result.calls.length).toBe(1); // Only instance deployment call
    });
  });
});
