import { useState, useEffect } from 'react';
import type { ContractArtifact, FunctionAbi, ContractInstanceWithAddress } from '@aztec/aztec.js';
import { Contract, FunctionType, loadContractArtifact, getAllFunctionAbis, AztecAddress } from '@aztec/aztec.js';
import { PREDEFINED_CONTRACTS, FORBIDDEN_FUNCTIONS } from './constants';

// Helper function to sort functions
const sortFunctions = (functions: FunctionAbi[], contractName: string): FunctionAbi[] => {
  if (contractName === 'SimplePrivateVoting' || contractName === 'EasyPrivateVoting') {
    const order = ['constructor', 'cast_vote', 'end_vote', 'get_vote'];
    return [...functions].sort((a, b) => {
      const indexA = order.indexOf(a.name);
      const indexB = order.indexOf(b.name);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return 0;
    });
  }
  return functions;
};

// Helper function to register contract class with PXE
const registerContractClassWithPXE = async (artifact: ContractArtifact, wallet: any) => {
  if (!wallet) {
    console.warn('Cannot register contract class: wallet not connected');
    return;
  }

  try {
    console.log('Pre-registering contract class with PXE...');
    await wallet.registerContractClass(artifact);
    console.log('Contract class pre-registered successfully');
  } catch (error) {
    console.error('Error pre-registering contract class:', error);
  }
};

export function useContractArtifact(selectedPredefinedContract: string, wallet: any) {
  const [contractArtifact, setContractArtifact] = useState<ContractArtifact | null>(null);
  const [functionAbis, setFunctionAbis] = useState<FunctionAbi[]>([]);
  const [isLoadingArtifact, setIsLoadingArtifact] = useState(false);

  useEffect(() => {
    const loadPredefinedContract = async () => {
      setIsLoadingArtifact(true);

      let contractArtifact;

      if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING) {
        try {
          const response = await fetch('/contracts/EasyPrivateVoting.json', {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch contract: ${response.status} ${response.statusText}`);
          }
          const artifact = await response.json();
          contractArtifact = loadContractArtifact(artifact);
        } catch (err) {
          console.error('Error loading EasyPrivateVoting artifact:', err);
        }
      } else if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN) {
        try {
          const response = await fetch('/contracts/SimpleToken.json', {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch contract: ${response.status} ${response.statusText}`);
          }
          const artifact = await response.json();
          contractArtifact = loadContractArtifact(artifact);
        } catch (err) {
          console.error('Error loading SimpleToken artifact:', err);
        }
      }

      if (contractArtifact) {
        console.log('Loaded contract artifact:', contractArtifact);
        setContractArtifact(contractArtifact);

        let functionAbis = getAllFunctionAbis(contractArtifact);

        // Add debug logging to show all available functions
        console.log('All contract functions:', functionAbis.map(fn => ({
          name: fn.name,
          type: fn.functionType,
          parameters: fn.parameters.map(p => `${p.name}: ${p.type}`)
        })));

        functionAbis = sortFunctions(functionAbis, contractArtifact.name);

        setFunctionAbis(functionAbis);

        console.log('Setting up contract artifact:', contractArtifact.name);

        // Register the contract class with PXE when a predefined contract is loaded
        if (wallet) {
          await registerContractClassWithPXE(contractArtifact, wallet);
        }
      }

      setIsLoadingArtifact(false);
    };

    if (selectedPredefinedContract) {
      loadPredefinedContract();
    }
  }, [selectedPredefinedContract, wallet]);

  return { contractArtifact, functionAbis, isLoadingArtifact, setContractArtifact, setFunctionAbis };
}

export function useContractFunctions(
  functionAbis: FunctionAbi[],
  filters: {
    searchTerm: string;
    private: boolean;
    public: boolean;
    utility: boolean;
  }
) {
  return functionAbis.filter(
    fn =>
      !fn.isInternal &&
      !fn.isInitializer &&
      !FORBIDDEN_FUNCTIONS.includes(fn.name) &&
      ((filters.private && fn.functionType === FunctionType.PRIVATE) ||
        (filters.public && fn.functionType === FunctionType.PUBLIC) ||
        (filters.utility && (fn.functionType === FunctionType.UTILITY || fn.functionType.toString() === "utility"))) &&
      (filters.searchTerm === '' || fn.name.includes(filters.searchTerm))
  );
}

export function useContractDeployment(
  contractArtifact: ContractArtifact | null,
  wallet: any,
  walletDB: any,
  setCurrentContract: (contract: Contract | null) => void,
  setCurrentContractAddress: (address: AztecAddress | null) => void,
  setCurrentTx: (tx: any) => void,
  setIsWorking: (isWorking: boolean) => void
) {
  const handleContractDeployment = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    console.log('Contract instance received:', contract ? 'Yes' : 'No');
    console.log('Alias:', alias);

    if (contract) {
      setIsWorking(true);

      const deploymentTx = {
        status: 'proving' as const,
        fnName: 'deploy',
        contractAddress: contract.address,
      };
      setCurrentTx(deploymentTx);

      console.log('Contract address:', contract.address.toString());
      console.log('Contract class ID:', contract.currentContractClassId.toString());
      console.log('Wallet available:', wallet ? 'Yes' : 'No');
      console.log('Contract artifact available:', contractArtifact ? 'Yes' : 'No');

      let hasError = false;

      try {
        try {
          console.log('Registering contract class with PXE...');
          await wallet.registerContractClass(contractArtifact);
          console.log('Contract class registered successfully with PXE');
        } catch (err) {
          console.error('Error registering contract class - continuing anyway:', err);
        }

        console.log('Initializing Contract instance at the deployed address...');
        const deployedContract = await Contract.at(contract.address, contractArtifact, wallet);
        console.log('Contract initialized successfully');

        console.log('Setting current contract address...');
        setCurrentContractAddress(deployedContract.address);
        console.log('Setting current contract instance...');
        setCurrentContract(deployedContract);

        console.log('Storing contract in walletDB...');
        await walletDB.storeContract(deployedContract.address, contractArtifact, undefined, alias);
        console.log('Contract stored successfully');

        const methods = Object.keys(deployedContract.methods);
        methods.forEach(method => console.log(`- ${method}`));

        setCurrentTx({
          ...deploymentTx,
          status: 'sending' as const,
        });

        console.log('Successfully deployed contract at address:', deployedContract.address.toString());
      } catch (error) {
        console.error('Deployment error:', error);

        hasError = true;

        setCurrentTx({
          ...deploymentTx,
          status: 'error' as const,
          error: error.message || 'Unknown deployment error',
        });
      } finally {
        if (!hasError) {
          setIsWorking(false);
        }
      }
    }
  };

  return { handleContractDeployment };
}
