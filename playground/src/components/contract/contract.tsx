import { css } from '@mui/styled-engine';
import { useDropzone } from 'react-dropzone';
import './dropzone.css';
import { useContext, useEffect, useState } from 'react';
import {
  AuthWitness,
  Contract,
  type ContractArtifact,
  type ContractInstanceWithAddress,
  loadContractArtifact,
  getAllFunctionAbis,
  type FunctionAbi,
  FunctionType,
  AztecAddress,
} from '@aztec/aztec.js';
import { AztecContext } from '../../aztecEnv';
import { AztecEnv } from '../../aztecEnv';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import IconButton from '@mui/material/IconButton';
import Input from '@mui/material/Input';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import { convertFromUTF8BufferAsString, formatFrAsString } from '../../utils/conversion';
import { DeployContractDialog } from './components/deployContractDialog';
import { FunctionParameter } from '../common/fnParameter';
import ClearIcon from '@mui/icons-material/Clear';
import { RegisterContractDialog } from './components/registerContractDialog';
import { CopyToClipboardButton } from '../common/copyToClipboardButton';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import SendIcon from '@mui/icons-material/Send';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { CreateAuthwitDialog } from './components/createAuthwitDialog';
import { parse } from 'buffer-json';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import { LoadingModal } from '../common/LoadingModal';
import { PREDEFINED_CONTRACTS, FORBIDDEN_FUNCTIONS, TOKEN_ALLOWED_FUNCTIONS, FUNCTION_DESCRIPTIONS } from './constants';
import { WalletDB } from '../../utils/storage';
import {
  container,
  headerSection,
  descriptionText,
  buttonContainer,
  actionButton,
  dropZoneContainer,
  uploadIcon,
  contractFnContainer,
  tokenSection,
  tokenHeader,
  searchContainer,
  filterContainer,
  filterButton,
  filterCheckbox,
  filterLabel,
  filterHelpIcon,
  functionCard,
  functionTypeLabel,
  functionName,
  functionDescription,
  parametersLabel,
  parameterInput,
  actionButtonsContainer,
  simulateButton,
  sendButton,
  authwitButton,
  loadingArtifactContainer,
  headerContainer,
  functionListContainer
} from './styles';

interface ExtendedFunctionAbi extends FunctionAbi {
  originalName?: string;
}

// Define the missing enum values if not present in the imported FunctionType
declare namespace FunctionTypeExtended {
  enum Type {
    PRIVATE = "private",
    PUBLIC = "public",
    UTILITY = "utility"
  }
}

export function ContractComponent() {
  const [contractArtifact, setContractArtifact] = useState<ContractArtifact | null>(null);
  const [functionAbis, setFunctionAbis] = useState<ExtendedFunctionAbi[]>([]);
  const [showUploadArea, setShowUploadArea] = useState(false);
  const [showNetworkConnect, setShowNetworkConnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    searchTerm: '',
    private: true,
    public: true,
    utility: true,
  });

  const [isLoadingArtifact, setIsLoadingArtifact] = useState(false);
  const [simulationResults, setSimulationResults] = useState({});
  const [parameters, setParameters] = useState({});

  const [openDeployContractDialog, setOpenDeployContractDialog] = useState(false);
  const [openRegisterContractDialog, setOpenRegisterContractDialog] = useState(false);
  const [openCreateAuthwitDialog, setOpenCreateAuthwitDialog] = useState(false);
  const [authwitFnData, setAuthwitFnData] = useState({
    name: '',
    parameters: [],
    isPrivate: false,
  });

  const {
    wallet,
    walletDB,
    currentContractAddress,
    currentContract,
    selectedPredefinedContract,
    setCurrentContract,
    setCurrentContractAddress,
    setCurrentTx,
    setSelectedPredefinedContract,
    nodeURL,
    isWorking,
    setIsWorking,
    pxe,
    node,
    setPXE,
    setLogs,
  } = useContext(AztecContext);

  useEffect(() => {
    if (selectedPredefinedContract === PREDEFINED_CONTRACTS.CUSTOM_UPLOAD) {
      setShowUploadArea(true);
      setContractArtifact(null);
      setFunctionAbis([]);
    } else {
      setShowUploadArea(false);
      if (selectedPredefinedContract) {
        setContractArtifact(null);
        setFunctionAbis([]);
        setIsLoadingArtifact(true);
      }
    }
  }, [selectedPredefinedContract]);

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
    } else if (contractName === 'SimpleToken') {
      return [...functions].sort((a, b) => {
        const indexA = TOKEN_ALLOWED_FUNCTIONS.indexOf(a.name);
        const indexB = TOKEN_ALLOWED_FUNCTIONS.indexOf(b.name);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      });
    }
    return functions;
  };

  const registerContractClassWithPXE = async (artifact: ContractArtifact) => {
    if (!wallet) {
      setError('Cannot register contract class: wallet not connected');
      return;
    }

    try {
      await wallet.registerContractClass(artifact);
    } catch (error) {
      setError(`Error pre-registering contract class: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const loadContractArtifactFromFile = async (contractName: string) => {
    try {
      const response = await fetch(`/contracts/${contractName}.json`, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch contract: ${response.status} ${response.statusText}`);
      }
      const artifact = await response.json();
      return loadContractArtifact(artifact);
    } catch (err) {
      setError(`Error loading ${contractName} artifact: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  useEffect(() => {
    const loadPredefinedContract = async () => {
      setIsLoadingArtifact(true);

      let contractArtifact;

      if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING) {
        contractArtifact = await loadContractArtifactFromFile('EasyPrivateVoting');
      } else if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN) {
        contractArtifact = await loadContractArtifactFromFile('SimpleToken');
      }

      if (contractArtifact) {
        setContractArtifact(contractArtifact);
        let functionAbis = getAllFunctionAbis(contractArtifact);
        functionAbis = sortFunctions(functionAbis, contractArtifact.name);
        setFunctionAbis(functionAbis);
        if (wallet) {
          await registerContractClassWithPXE(contractArtifact);
        }
      }

      setIsLoadingArtifact(false);
    };

    if (selectedPredefinedContract && selectedPredefinedContract !== PREDEFINED_CONTRACTS.CUSTOM_UPLOAD) {
      void loadPredefinedContract();
    }
  }, [selectedPredefinedContract, wallet]);

  const handleContractDeployment = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    if (!contract) {
      setError('No contract instance provided');
      return;
    }

    try {
      setIsWorking(true);
      const deploymentTx = {
        status: 'proving' as const,
        fnName: 'deploy',
        contractAddress: contract.address,
      };
      setCurrentTx(deploymentTx);

      await wallet.registerContractClass(contractArtifact);
      const deployedContract = await Contract.at(contract.address, contractArtifact, wallet);
      setCurrentContractAddress(deployedContract.address);
      setCurrentContract(deployedContract);
      await walletDB.storeContract(deployedContract.address, contractArtifact, undefined, alias);

      setCurrentTx({
        ...deploymentTx,
        status: 'sending' as const,
      });
    } catch (err) {
      setError(`Failed to deploy contract: ${err instanceof Error ? err.message : String(err)}`);
      setCurrentTx({
        status: 'error' as const,
        fnName: 'deploy',
        error: err instanceof Error ? err.message : String(err),
        contractAddress: contract.address,
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleContractCreation = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    if (!contract) {
      setError('No contract instance provided');
      return;
    }

    try {
      setIsWorking(true);
      const registrationTx = {
        status: 'proving' as const,
        fnName: 'register',
        contractAddress: contract.address,
      };
      setCurrentTx(registrationTx);

      await walletDB.storeContract(contract.address, contractArtifact, undefined, alias);
      setCurrentContract(await Contract.at(contract.address, contractArtifact, wallet));
      setCurrentContractAddress(contract.address);

      setCurrentTx({
        ...registrationTx,
        status: 'sending' as const,
      });
    } catch (err) {
      setError(`Failed to create contract: ${err instanceof Error ? err.message : String(err)}`);
      setCurrentTx({
        status: 'error' as const,
        fnName: 'register',
        error: err instanceof Error ? err.message : String(err),
        contractAddress: contract.address,
      });
    } finally {
      setIsWorking(false);
    }
  };

  const simulate = async (fnName: string) => {
    if (!currentContract) {
      setError('No contract instance available');
      return;
    }

    try {
      const realFnName = fnName === 'constructor' ? 'deploy' : fnName;
      const fnParameters = parameters[fnName] || [];
      const result = await currentContract.methods[realFnName](...fnParameters).simulate();
      setSimulationResults(prev => ({ ...prev, [fnName]: result }));
      return result;
    } catch (err) {
      setError(`Failed to simulate function: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  };

  const send = async (fnName: string) => {
    if (!currentContract || !wallet) {
      setError('No contract instance or wallet available');
      return;
    }

    try {
      const realFnName = fnName === 'constructor' ? 'deploy' : fnName;
      const fnParameters = parameters[fnName] || [];
      const receipt = await currentContract.methods[realFnName](...fnParameters).send().wait();
      await walletDB.storeTx({
        contractAddress: currentContract.address,
        txHash: receipt.txHash,
        fnName,
        receipt,
      });
      return receipt;
    } catch (err) {
      setError(`Failed to send transaction: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  };

  const handleAuthwitFnDataChanged = (
    fnName: string,
    parameters: any[],
    isPrivate: boolean,
  ) => {
    setAuthwitFnData({
      name: fnName,
      parameters,
      isPrivate,
    });
  };

  const handleAuthwitCreation = async (witness?: AuthWitness, alias?: string) => {
    if (!witness) {
      setError('No auth witness provided');
      return;
    }

    try {
      await walletDB.storeAuthwitness(witness, undefined, alias);
    } catch (err) {
      setError(`Failed to create auth witness: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const resetPXEDatabase = async () => {
    if (!pxe || !node) {
      setError('PXE or Node not available');
      return;
    }

    try {
      // Delete the IndexedDB database
      await new Promise<void>((resolve, reject) => {
        const request = window.indexedDB.deleteDatabase('pxe_data');
        request.onerror = () => reject(new Error('Failed to delete PXE database'));
        request.onsuccess = () => resolve();
      });

      // Reinitialize PXE with fresh state
      const newPxe = await AztecEnv.initPXE(node, setLogs);
      setPXE(newPxe);
    } catch (err) {
      setError(`Failed to reset PXE: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleShowNetworkConnect = () => {
    window.dispatchEvent(new CustomEvent('aztec:showNetworkConnect'));
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async files => {
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.name.endsWith('.json')) {
        alert('Please upload a JSON file. Other file types are not supported.');
        return;
      }

      const reader = new FileReader();
      setIsLoadingArtifact(true);

      reader.onload = async e => {
        try {
          if (!e.target?.result) {
            throw new Error('Could not read the file content');
          }

          const fileContent = e.target.result as string;
          const artifact = JSON.parse(fileContent);
          const contractArtifact = loadContractArtifact(artifact);

          setSelectedPredefinedContract('');
          setCurrentContractAddress(null);

          setContractArtifact(contractArtifact);

          let functionAbis = getAllFunctionAbis(contractArtifact);
          functionAbis = sortFunctions(functionAbis, contractArtifact.name);
          setFunctionAbis(functionAbis);

          setFilters({
            searchTerm: '',
            private: true,
            public: true,
            utility: true,
          });

          setShowUploadArea(false);

        } catch (error) {
          console.error('Error parsing contract artifact:', error);
          alert(`Failed to load contract artifact: ${error.message || 'Unknown error'}`);
        } finally {
          setIsLoadingArtifact(false);
        }
      };

      reader.onerror = () => {
        console.error('Error reading file:', reader.error);
        alert('Error reading the uploaded file. Please try again.');
        setIsLoadingArtifact(false);
      };

      reader.readAsText(file);
    },
    accept: {
      'application/json': ['.json']
    },
    multiple: false
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleParameterChange = (fnName: string, index: number, value: any) => {
    const matchingFn = functionAbis.find(f => f.name === fnName) as ExtendedFunctionAbi;
    // Use the original name only if it exists
    const realFnName = matchingFn?.originalName || fnName;

    const fnParameters = parameters[realFnName] || [];
    fnParameters[index] = value;
    setParameters({ ...parameters, [realFnName]: fnParameters });
  };

  // Debug effect to log filtered functions
  useEffect(() => {
    if (functionAbis.length > 0) {
      const filtered = functionAbis.filter(
        fn => !fn.isInternal &&
        !fn.isInitializer &&
        !FORBIDDEN_FUNCTIONS.includes(fn.name) &&
        ((filters.private && fn.functionType === FunctionType.PRIVATE) ||
          (filters.public && fn.functionType === FunctionType.PUBLIC) ||
          (filters.utility && (fn.functionType === FunctionType.UTILITY || fn.functionType.toString() === "utility"))) &&
        (filters.searchTerm === '' || fn.name.includes(filters.searchTerm))
      );

      const excluded = functionAbis.filter(
        fn => fn.isInternal ||
        fn.isInitializer ||
        FORBIDDEN_FUNCTIONS.includes(fn.name) ||
        !((filters.private && fn.functionType === FunctionType.PRIVATE) ||
          (filters.public && fn.functionType === FunctionType.PUBLIC) ||
          (filters.utility && (fn.functionType === FunctionType.UTILITY || fn.functionType.toString() === "utility"))) ||
        (filters.searchTerm !== '' && !fn.name.includes(filters.searchTerm))
      );

      console.log('Filtered functions:', filtered.map(fn => fn.name));
      console.log('Excluded functions:', excluded.map(fn => ({
        name: fn.name,
        isInternal: fn.isInternal,
        isInitializer: fn.isInitializer,
        functionType: fn.functionType,
        forbidden: FORBIDDEN_FUNCTIONS.includes(fn.name),
        matchesFilter: (filters.private && fn.functionType === FunctionType.PRIVATE) ||
          (filters.public && fn.functionType === FunctionType.PUBLIC) ||
          (filters.utility && (fn.functionType === FunctionType.UTILITY || fn.functionType.toString() === "utility")),
        matchesSearch: filters.searchTerm === '' || fn.name.includes(filters.searchTerm)
      })));
    }
  }, [functionAbis, filters]);

  return (
    <div css={container}>
      <LoadingModal />
      {showUploadArea ? (
        !isLoadingArtifact ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '1rem' }}>
            <div css={dropZoneContainer}>
              <div {...getRootProps({ className: 'dropzone' })}>
                <input {...getInputProps()} />
                <UploadFileIcon css={uploadIcon} />
                <Typography variant="h5" sx={{ mb: 2, color: '#9894FF' }}>Upload Contract JSON Artifact</Typography>
                <Typography>Drag and drop a contract JSON file here, or click to select a file</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, mb: 3, display: 'block' }}>
                  The contract artifact should be a JSON file exported from your Noir/Aztec project
                </Typography>
                <Button
                  variant="contained"
                  sx={{ mt: 2, backgroundColor: '#9894FF', '&:hover': { backgroundColor: '#8C7EFF' } }}
                >
                  Select File
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div css={loadingArtifactContainer}>
            <Typography variant="h5">Loading artifact...</Typography>
            <CircularProgress style={{ color: '#9894FF' }} size={100} />
          </div>
        )
      ) : isLoadingArtifact ? (
        <div css={loadingArtifactContainer}>
          <Typography variant="h5">Loading contract...</Typography>
          <CircularProgress style={{ color: '#9894FF' }} size={100} />
        </div>
      ) : !contractArtifact ? (
        <div css={loadingArtifactContainer}>
          <Typography variant="h5">No contract loaded</Typography>
          <Typography>
            Select a contract from the dropdown or upload your own.
          </Typography>
        </div>
      ) : (
        <div css={contractFnContainer}>
          <div css={headerSection}>
            <div css={descriptionText}>
             {selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING ? (
               <>
                 On this page you can simulate transactions in this contract and send them to the network.
                 <br />
                 This contract allows a person to vote privately on a public vote.
               </>
             ) : selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN ? (
               <>
                 On this page you can simulate transactions in this contract and send them to the network.
                 <br />
                 This is a simple token contract demonstrating holding it both publicly and privately, and being able to transfer publicly and privately, and move it in and out of state publicly and privately.
               </>
             ) : (
               <>
                 On this page you can simulate transactions in this contract and send them to the network.
               </>
             )}
            </div>
            <div css={buttonContainer}>
              <Button
                css={actionButton}
                onClick={() => setOpenDeployContractDialog(true)}
                disabled={!nodeURL}
              >
                Deploy
              </Button>
              <Button
                css={actionButton}
                onClick={() => window.open('https://docs.aztec.network/', '_blank')}
              >
                Go to Docs
              </Button>
              <DeployContractDialog
                contractArtifact={contractArtifact}
                open={openDeployContractDialog}
                onClose={handleContractDeployment}
              />
              <RegisterContractDialog
                contractArtifact={contractArtifact}
                open={openRegisterContractDialog}
                onClose={handleContractCreation}
              />
            </div>
          </div>

          <div css={tokenSection}>
            <div css={tokenHeader}>
              {selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING ? 'Simple Private Voting' :
               selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN ? 'Simple Token' :
               contractArtifact?.name || 'Contract'}
            </div>
            <div css={searchContainer}>
              <SearchIcon style={{ color: 'rgba(60, 60, 67, 0.6)', marginRight: '8px' }} />
              <Input
                type="text"
                fullWidth
                disableUnderline
                placeholder="Search"
                value={filters.searchTerm}
                onChange={e => setFilters({ ...filters, searchTerm: e.target.value })}
                style={{
                  fontFamily: 'SF Pro Text, sans-serif',
                  fontSize: '17px',
                  color: 'rgba(60, 60, 67, 0.6)'
                }}
              />
            </div>
            <div css={filterContainer}>
              <Tooltip
                title="These functions are simulated locally and only proofs are sent to Aztec"
                arrow
                componentsProps={{
                  tooltip: {
                    sx: {
                      fontSize: '14px',
                      padding: '10px',
                      maxWidth: '300px',
                      lineHeight: '1.4'
                    }
                  }
                }}
              >
                <div css={filterButton}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        css={filterCheckbox}
                        checked={filters.private}
                        onChange={e => setFilters({ ...filters, private: e.target.checked })}
                      />
                    }
                    label={<span css={filterLabel}>Private</span>}
                  />
                </div>
              </Tooltip>
              <Tooltip
                title="These are public functions that work similarly to other blockchains"
                arrow
                componentsProps={{
                  tooltip: {
                    sx: {
                      fontSize: '14px',
                      padding: '10px',
                      maxWidth: '300px',
                      lineHeight: '1.4'
                    }
                  }
                }}
              >
                <div css={filterButton}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        css={filterCheckbox}
                        checked={filters.public}
                        onChange={e => setFilters({ ...filters, public: e.target.checked })}
                      />
                    }
                    label={<span css={filterLabel}>Public</span>}
                  />
                </div>
              </Tooltip>
              <Tooltip
                title="Only invoked by applications that interact with contracts to perform state queries from an off-chain client. They are unconstrained, meaning no proofs are generated"
                arrow
                componentsProps={{
                  tooltip: {
                    sx: {
                      fontSize: '14px',
                      padding: '10px',
                      maxWidth: '350px',
                      lineHeight: '1.4'
                    }
                  }
                }}
              >
                <div css={filterButton}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        css={filterCheckbox}
                        checked={filters.utility}
                        onChange={e => setFilters({ ...filters, utility: e.target.checked })}
                      />
                    }
                    label={<span css={filterLabel}>Utility</span>}
                  />
                </div>
              </Tooltip>
            </div>
          </div>

          {!currentContract && (
            <div style={{ padding: '20px', margin: '10px 0', textAlign: 'center', backgroundColor: 'rgba(152, 148, 255, 0.1)', borderRadius: '8px' }}>
              <Typography variant="subtitle1" style={{ color: '#9894FF' }}>
                {selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING ? (
                  'This is a simple voting contract that allows users to cast their votes privately. Your vote remains hidden while still being verifiably counted.'
                ) : selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN ? (
                  'This contract demonstrates private token transfers and balances. Users can transact without revealing amounts or participants while maintaining verifiability.'
                ) : (
                  'This is your own uploaded contract. Remember you will need to deploy it before you can interact with it.'
                )}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {!nodeURL ? (
                  <>
                    You are not connected to a network. Please <span
                      onClick={handleShowNetworkConnect}
                      style={{ color: '#9894FF', cursor: 'pointer', textDecoration: 'underline' }}>
                      connect
                    </span> first.
                  </>
                ) : (
                  <>
                    {selectedPredefinedContract ? 'Remember you will need to deploy it before you can interact with it.' : 'Click the "Deploy" button above to deploy this contract to the network.'}
                    {functionAbis.some(fn => fn.isInitializer) && (
                      <div style={{ marginTop: '8px'}}>
                        This contract has initializer functions that will be available in the deployment dialog.
                      </div>
                    )}
                  </>
                )}
              </Typography>
            </div>
          )}

          {/* Contract functions list */}
          <div css={functionListContainer}>
            {/* Debug information */}
            {functionAbis.length === 0 && contractArtifact && (
              <div style={{ padding: '20px', margin: '10px 0', textAlign: 'center', backgroundColor: 'rgba(255, 235, 59, 0.1)', borderRadius: '8px' }}>
                <Typography variant="subtitle1" style={{ color: '#FF9800' }}>
                  No functions found for this contract. Please check the console for debugging information.
                </Typography>
              </div>
            )}
            {functionAbis
              .filter(
                fn =>
                  !fn.isInternal &&
                  !fn.isInitializer &&
                  !FORBIDDEN_FUNCTIONS.includes(fn.name) &&
                  ((filters.private && fn.functionType === FunctionType.PRIVATE) ||
                    (filters.public && fn.functionType === FunctionType.PUBLIC) ||
                    (filters.utility && (fn.functionType === FunctionType.UTILITY || fn.functionType.toString() === "utility"))) &&
                  (filters.searchTerm === '' || fn.name.includes(filters.searchTerm)),
              )
              .map(fn => (
                <div
                  key={fn.name}
                  css={functionCard}
                >
                  <div style={{ padding: '36px' }}>
                    <div css={functionTypeLabel}>
                      {fn.functionType.toUpperCase()}
                    </div>
                    <div css={functionName}>
                      {fn.name}
                    </div>
                    {selectedPredefinedContract !== PREDEFINED_CONTRACTS.CUSTOM_UPLOAD && FUNCTION_DESCRIPTIONS[fn.name] && (
                      <div css={functionDescription}>
                        {FUNCTION_DESCRIPTIONS[fn.name]}
                      </div>
                    )}

                    {fn.parameters.length > 0 && (
                      <>
                        <div css={parametersLabel}>
                          PARAMETERS
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '15px' }}>
                          {fn.parameters.map((param, i) => (
                            <div key={param.name} style={{ width: '212px', marginRight: '16px' }}>
                              <FunctionParameter
                                parameter={param}
                                onParameterChange={newValue => {
                                  handleParameterChange(fn.name, i, newValue);
                                }}
                                customStyle={parameterInput}
                              />
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {!isWorking && simulationResults[fn.name] !== undefined && (
                      <div style={{ marginTop: '15px' }}>
                        <Typography variant="body1" sx={{ fontWeight: 400 }}>
                          Simulation results:&nbsp;
                          {typeof simulationResults[fn.name] === 'object'
                            ? JSON.stringify(simulationResults[fn.name])
                            : simulationResults[fn.name]?.toString()}
                        </Typography>
                      </div>
                    )}
                    {isWorking && <CircularProgress size={'1rem'} style={{ marginTop: '15px', color: '#9894FF' }} />}

                    <div css={actionButtonsContainer}>
                      <button
                        css={simulateButton}
                        disabled={!wallet || !currentContract || isWorking}
                        onClick={() => simulate(fn.name)}
                      >
                        SIMULATE
                        <PsychologyIcon style={{ fontSize: '14px', marginLeft: '5px' }} />
                      </button>
                      <button
                        css={sendButton}
                        disabled={!wallet || !currentContract || isWorking || fn.functionType.toString() === "utility"}
                        onClick={() => send(fn.name)}
                      >
                        SEND
                        <SendIcon style={{ fontSize: '14px', marginLeft: '5px' }} />
                      </button>
                      {selectedPredefinedContract === PREDEFINED_CONTRACTS.CUSTOM_UPLOAD ||
                       (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN &&
                        ['burn_public', 'public_transfer', 'transfer_from_private_to_public', 'private_transfer', 'burn_private'].includes(fn.name)) ? (
                        <button
                          css={authwitButton}
                          disabled={!wallet || !currentContract || isWorking || fn.functionType.toString() === "utility"}
                          onClick={() =>
                            handleAuthwitFnDataChanged(fn.name, parameters[fn.name], fn.functionType === FunctionType.PRIVATE)
                          }
                        >
                          AUTHWIT
                          <VpnKeyIcon style={{ fontSize: '14px', marginLeft: '5px' }} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      <CreateAuthwitDialog
        open={openCreateAuthwitDialog}
        onClose={handleAuthwitCreation}
        fnName={authwitFnData.name}
        args={authwitFnData.parameters}
        isPrivate={authwitFnData.isPrivate}
      />
    </div>
  );
}
