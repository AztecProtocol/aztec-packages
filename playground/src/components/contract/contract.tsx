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
  AztecAddress,
} from '@aztec/aztec.js';
import { AztecContext } from '../../aztecEnv';
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

const container = css({
  display: 'flex',
  flexDirection: 'column',
  height: 'calc(100vh - 50px)',
  width: '100%',
  overflow: 'hidden',
});

const dropZoneContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '80%',
  border: '3px dashed #1976d2',
  borderRadius: '15px',
  margin: '0rem 2rem 2rem 2rem',
  backgroundColor: 'rgba(25, 118, 210, 0.04)',
});

const uploadIcon = css({
  fontSize: '64px',
  color: '#1976d2',
  marginBottom: '1rem',
});

const contractFnContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
});

const headerContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  margin: '0 0.5rem',
  padding: '0.5rem',
  overflow: 'hidden',
  flexShrink: 0,
  maxHeight: '120px',
});

const functionListContainer = css({
  flex: 1,
  overflowY: 'auto',
  padding: '0 0.5rem',
});

const header = css({
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  justifyContent: 'space-between',
});

const search = css({
  display: 'flex',
  overflow: 'hidden',
  '@media (width <= 800px)': {
    width: '100%',
  },
  '@media (width > 800px)': {
    maxWidth: '500px',
  },
});

const contractActions = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
});

const simulationContainer = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
});

const checkBoxLabel = css({
  height: '1.5rem',
  marginLeft: '-10px',
});

const loadingArtifactContainer = css({
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'center',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2rem',
});

const FORBIDDEN_FUNCTIONS = ['process_log', 'sync_notes', 'public_dispatch'];

const PREDEFINED_CONTRACTS = {
  SIMPLE_VOTING: 'simple_voting',
  SIMPLE_TOKEN: 'simple_token',
  CUSTOM_UPLOAD: 'custom_upload'
};

interface ExtendedFunctionAbi extends FunctionAbi {
  originalName?: string;
}

const TOKEN_FUNCTION_MAPPING = {
  'transfer_in_public': 'public_transfer',
  'transfer_to_public': 'transfer_from_private_to_public',
  'transfer_to_private': 'transfer_from_public_to_private'
};

const TOKEN_ALLOWED_FUNCTIONS = [
  'name',
  'symbol',
  'decimals',
  'balance_of_private',
  'balance_of_public',
  'total_supply_private',
  'total_supply_public',
  'mint_privately',
  'mint_publicly',
  'private_transfer',
  'transfer_in_public', // Will be renamed to public_transfer
  'transfer_to_public', // Will be renamed to transfer_from_private_to_public
  'transfer_to_private', // Will be renamed to transfer_from_public_to_private
];

const MOCK_SIMPLE_TOKEN_ARTIFACT = {
  name: 'SimpleToken',
  version: '0.1.0',
  functions: [
    {
      name: 'transfer',
      functionType: 'private',
      parameters: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'field' }
      ],
      returnType: 'bool'
    },
    {
      name: 'balance_of',
      functionType: 'public',
      parameters: [
        { name: 'account', type: 'address' }
      ],
      returnType: 'field'
    },
    {
      name: 'mint',
      functionType: 'public',
      parameters: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'field' }
      ],
      returnType: 'bool'
    }
  ]
};

export function ContractComponent() {
  const [contractArtifact, setContractArtifact] = useState<ContractArtifact | null>(null);
  const [functionAbis, setFunctionAbis] = useState<ExtendedFunctionAbi[]>([]);
  const [showUploadArea, setShowUploadArea] = useState(false);

  const [filters, setFilters] = useState({
    searchTerm: '',
    private: true,
    public: true,
    unconstrained: true,
  });

  const [isLoadingArtifact, setIsLoadingArtifact] = useState(false);

  const [isWorking, setIsWorking] = useState(false);

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
  } = useContext(AztecContext);

  useEffect(() => {
    if (selectedPredefinedContract === PREDEFINED_CONTRACTS.CUSTOM_UPLOAD) {
      setShowUploadArea(true);
    } else {
      setShowUploadArea(false);
    }
  }, [selectedPredefinedContract]);

  useEffect(() => {
    console.log('Wallet:', wallet);
    console.log('Current Contract:', currentContract);
    console.log('Is Working:', isWorking);
  }, [wallet, currentContract, isWorking]);

  const sortFunctions = (functions: FunctionAbi[], contractName: string): FunctionAbi[] => {
    if (contractName === 'SimplePrivateVoting') {
      const order = ['constructor', 'cast_vote', 'end_vote', 'get_vote'];

      return [...functions].sort((a, b) => {
        const indexA = order.indexOf(a.name);
        const indexB = order.indexOf(b.name);

        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }

        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        return 0;
      });
    }

    return functions;
  };


  const filterTokenFunctions = (functions: FunctionAbi[]): ExtendedFunctionAbi[] => {
    return functions
      .filter(fn => TOKEN_ALLOWED_FUNCTIONS.includes(fn.name))
      .map(fn => {
        if (TOKEN_FUNCTION_MAPPING[fn.name]) {
          return {
            ...fn,
            name: TOKEN_FUNCTION_MAPPING[fn.name],
            originalName: fn.name
          };
        }
        return fn;
      });
  };

  useEffect(() => {
    const loadPredefinedContract = async () => {
      setIsLoadingArtifact(true);

      let contractArtifact;

      if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING) {
        try {
          const response = await fetch('/contracts/SimplePrivateVoting.json', {
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
          console.error('Error loading SimplePrivateVoting artifact:', err);
        }
      } else if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN) {
        try {
          const response = await fetch('/contracts/Token.json', {
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
          console.error('Error loading Token artifact:', err);
        }
      }

      if (contractArtifact) {
        console.log('Loaded contract artifact:', contractArtifact);
        setContractArtifact(contractArtifact);

        let functionAbis = getAllFunctionAbis(contractArtifact);

        if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN) {
          functionAbis = filterTokenFunctions(functionAbis);
        }

        functionAbis = sortFunctions(functionAbis, contractArtifact.name);

        setFunctionAbis(functionAbis);
        setFilters({
          searchTerm: '',
          private: true,
          public: true,
          unconstrained: true,
        });

        console.log('Setting up contract artifact:', contractArtifact.name);
      }

      setIsLoadingArtifact(false);
    };

    if (selectedPredefinedContract) {
      loadPredefinedContract();
    }
  }, [selectedPredefinedContract]);

  useEffect(() => {
    const loadCurrentContract = async () => {
      setIsLoadingArtifact(true);
      const artifactAsString = await walletDB.retrieveAlias(`artifacts:${currentContractAddress}`);
      const contractArtifact = loadContractArtifact(parse(convertFromUTF8BufferAsString(artifactAsString)));
      const contract = await Contract.at(currentContractAddress, contractArtifact, wallet);
      setCurrentContract(contract);
      setContractArtifact(contract.artifact);
      setFunctionAbis(sortFunctions(getAllFunctionAbis(contract.artifact), contract.artifact.name));
      setFilters({
        searchTerm: '',
        private: true,
        public: true,
        unconstrained: true,
      });
      setIsLoadingArtifact(false);
    };
    if (currentContractAddress && currentContract?.address !== currentContractAddress) {
      loadCurrentContract();
    }
  }, [currentContractAddress]);

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
            unconstrained: true,
          });


          setShowUploadArea(false);

          if (wallet) {
            setTimeout(() => {
              if (confirm('Would you like to deploy this contract now?')) {
                setOpenDeployContractDialog(true);
              }
            }, 500);
          }

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
    const realFnName =
      selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN &&
      matchingFn?.originalName || fnName;

    const fnParameters = parameters[realFnName] || [];
    fnParameters[index] = value;
    setParameters({ ...parameters, [realFnName]: fnParameters });
  };

  const handleContractDeployment = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    if (contract) {
      try {
        const deployedContract = await Contract.at(contract.address, contractArtifact, wallet);
        setCurrentContractAddress(deployedContract.address);
        setCurrentContract(deployedContract);
        await walletDB.storeContract(deployedContract.address, contractArtifact, undefined, alias);
        console.log('Successfully deployed contract at address:', deployedContract.address.toString());
      } catch (error) {
        console.error('Error setting up deployed contract:', error);
        alert('Error setting up the deployed contract. Please try again.');
      }
    }
    setOpenDeployContractDialog(false);
  };

  const handleContractCreation = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    if (contract && alias) {
      try {
        await walletDB.storeContract(contract.address, contractArtifact, undefined, alias);
        setCurrentContract(await Contract.at(contract.address, contractArtifact, wallet));
        setCurrentContractAddress(contract.address);
        console.log('Successfully registered contract at address:', contract.address.toString());
      } catch (error) {
        console.error('Error registering contract:', error);
        alert('Error registering the contract. Please try again.');
      }
    }
    setOpenDeployContractDialog(false);
    setOpenRegisterContractDialog(false);
  };

  const simulate = async (fnName: string) => {
    if (!currentContract) {
      alert('You need to deploy this contract before you can simulate functions.');
      return;
    }

    setIsWorking(true);
    let result;
    try {
      const matchingFn = functionAbis.find(f => f.name === fnName) as ExtendedFunctionAbi;
      const realFnName =
        selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN &&
        matchingFn?.originalName || fnName;

      const fnParameters = parameters[realFnName] ?? [];
      const call = currentContract.methods[realFnName](...fnParameters);

      result = await call.simulate();
      setSimulationResults({
        ...simulationResults,
        ...{ [fnName]: { success: true, data: result } },
      });
    } catch (e) {
      console.error('Simulation error:', e);
      setSimulationResults({
        ...simulationResults,
        ...{ [fnName]: { success: false, error: e.message } },
      });
    } finally {
      setIsWorking(false);
    }
  };

  const send = async (fnName: string) => {
    if (!currentContract) {
      alert('You need to deploy this contract before you can send transactions.');
      return;
    }

    setIsWorking(true);
    let receipt;
    let txHash;

    const matchingFn = functionAbis.find(f => f.name === fnName) as ExtendedFunctionAbi;
    const realFnName =
      selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN &&
      matchingFn?.originalName || fnName;

    const currentTx = {
      status: 'proving' as const,
      fnName: fnName,
      contractAddress: currentContract.address,
    };
    setCurrentTx(currentTx);

    try {
      const call = currentContract.methods[realFnName](...(parameters[realFnName] || []));

      const provenCall = await call.prove();
      txHash = await provenCall.getTxHash();
      setCurrentTx({
        ...currentTx,
        ...{ txHash, status: 'sending' },
      });
      receipt = await provenCall.send().wait({ dontThrowOnRevert: true });
      await walletDB.storeTx({
        contractAddress: currentContract.address,
        txHash,
        fnName,
        receipt,
      });
      setCurrentTx({
        ...currentTx,
        ...{
          txHash,
          status: receipt.status,
          receipt,
          error: receipt.error,
        },
      });
    } catch (e) {
      console.error('Transaction error:', e);
      setCurrentTx({
        ...currentTx,
        ...{
          txHash,
          status: 'error',
          error: e.message,
        },
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleAuthwitFnDataChanged = (
    fnName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: any[],
    isPrivate: boolean,
  ) => {
    const matchingFn = functionAbis.find(f => f.name === fnName) as ExtendedFunctionAbi;
    const realFnName =
      selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN &&
      matchingFn?.originalName || fnName;

    setAuthwitFnData({ name: realFnName, parameters, isPrivate });
    setOpenCreateAuthwitDialog(true);
  };

  const handleAuthwitCreation = async (witness?: AuthWitness, alias?: string) => {
    if (witness && alias) {
      await walletDB.storeAuthwitness(witness, undefined, alias);
    }
    setAuthwitFnData({ name: '', parameters: [], isPrivate: false });
    setOpenCreateAuthwitDialog(false);
  };

  return (
    <div css={container}>
      {showUploadArea ? (
        !isLoadingArtifact ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '1rem' }}>
            <div css={dropZoneContainer}>
              <div {...getRootProps({ className: 'dropzone' })}>
                <input {...getInputProps()} />
                <UploadFileIcon css={uploadIcon} />
                <Typography variant="h5" sx={{ mb: 2, color: '#1976d2' }}>Upload Contract JSON Artifact</Typography>
                <Typography>Drag and drop a contract JSON file here, or click to select a file</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, mb: 3, display: 'block' }}>
                  The contract artifact should be a JSON file exported from your Noir/Aztec project
                </Typography>
                <Button
                  variant="contained"
                  sx={{ mt: 2 }}
                >
                  Select File
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <div css={loadingArtifactContainer}>
              <Typography variant="h5">Loading artifact...</Typography>
              <CircularProgress size={100} />
            </div>
          </div>
        )
      ) : !contractArtifact ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <div css={loadingArtifactContainer}>
            <Typography variant="h5">No contract loaded</Typography>
            <Typography>
              Select a contract from the dropdown or upload your own.
            </Typography>
          </div>
        </div>
      ) : (
        <div css={contractFnContainer}>
          <div css={headerContainer}>
            <div css={header}>
              <Typography variant="h3" css={{ marginRight: '0.5rem' }}>
                {contractArtifact.name}
              </Typography>
              <div css={contractActions}>
                <Button
                  variant="contained"
                  size="small"
                  css={{ marginRight: '0.5rem' }}
                  onClick={() => setOpenDeployContractDialog(true)}
                >
                  Deploy
                </Button>
                <Button size="small" variant="contained" onClick={() => setOpenRegisterContractDialog(true)}>
                  Register
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
              {selectedPredefinedContract && (
                <Typography variant="subtitle1" color="text.secondary">
                  Sample Contract
                </Typography>
              )}
              {currentContract && (
                <div css={contractActions}>
                  <Typography color="text.secondary">{formatFrAsString(currentContract.address.toString())}</Typography>
                  <CopyToClipboardButton disabled={false} data={currentContract.address.toString()} />
                  <IconButton
                    onClick={() => {
                      setCurrentContractAddress(null);
                      setCurrentContract(null);
                      setContractArtifact(null);
                    }}
                  >
                    <ClearIcon />
                  </IconButton>
                </div>
              )}
            </div>
            <div css={search}>
              <FormGroup sx={{ width: '100%' }}>
                <Input
                  type="text"
                  fullWidth
                  placeholder="Search function"
                  value={filters.searchTerm}
                  onChange={e => setFilters({ ...filters, searchTerm: e.target.value })}
                  endAdornment={
                    <InputAdornment position="end">
                      <FindInPageIcon />
                    </InputAdornment>
                  }
                />
                <div
                  css={{
                    display: 'flex',
                    flexDirection: 'row',
                    marginTop: '0.5rem',
                    width: '100%',
                  }}
                >
                  <FormControlLabel
                    css={checkBoxLabel}
                    control={
                      <Checkbox
                        sx={{ paddingRight: 0 }}
                        checked={filters.private}
                        onChange={e => setFilters({ ...filters, private: e.target.checked })}
                      />
                    }
                    label="Private"
                  />
                  <FormControlLabel
                    css={checkBoxLabel}
                    control={
                      <Checkbox
                        sx={{ padding: 0 }}
                        checked={filters.public}
                        onChange={e => setFilters({ ...filters, public: e.target.checked })}
                      />
                    }
                    label="Public"
                  />
                  <FormControlLabel
                    css={checkBoxLabel}
                    control={
                      <Checkbox
                        sx={{ padding: 0 }}
                        checked={filters.unconstrained}
                        onChange={e =>
                          setFilters({
                            ...filters,
                            unconstrained: e.target.checked,
                          })
                        }
                      />
                    }
                    label="Unconstrained"
                  />
                </div>
              </FormGroup>
            </div>
          </div>

          {!currentContract && (
            <div style={{ padding: '20px', margin: '10px', textAlign: 'center', backgroundColor: 'rgba(33, 150, 243, 0.1)', borderRadius: '8px' }}>
              <Typography variant="subtitle1" color="primary">
                You need to deploy this contract before you can interact with it.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Click the "Deploy" button above to deploy this contract to the network.
              </Typography>
            </div>
          )}

          {/* Contract functions list */}
          <div css={functionListContainer}>
            {functionAbis
              .filter(
                fn =>
                  !fn.isInternal &&
                  !FORBIDDEN_FUNCTIONS.includes(fn.name) &&
                  ((filters.private && fn.functionType === 'private') ||
                    (filters.public && fn.functionType === 'public') ||
                    (filters.unconstrained && fn.functionType === 'unconstrained')) &&
                  (filters.searchTerm === '' || fn.name.includes(filters.searchTerm)),
              )
              .map(fn => (
                <Card
                  key={fn.name}
                  variant="outlined"
                  sx={{
                    backgroundColor: 'primary.light',
                    margin: '0.5rem',
                    overflow: 'hidden',
                  }}
                >
                  <CardContent sx={{ textAlign: 'left' }}>
                    <Typography gutterBottom sx={{ color: 'text.secondary', fontSize: 14 }}>
                      {fn.functionType}
                    </Typography>
                    <Typography variant="h5" sx={{ marginBottom: '1rem' }}>
                      {fn.name}
                    </Typography>
                    {fn.parameters.length > 0 && (
                      <>
                        <Typography
                          gutterBottom
                          sx={{
                            color: 'text.secondary',
                            fontSize: 14,
                            marginTop: '1rem',
                          }}
                        >
                          Parameters
                        </Typography>
                        <FormGroup row css={{ marginBottom: '1rem' }}>
                          {fn.parameters.map((param, i) => (
                            <FunctionParameter
                              parameter={param}
                              key={param.name}
                              onParameterChange={newValue => {
                                handleParameterChange(fn.name, i, newValue);
                              }}
                            />
                          ))}
                        </FormGroup>
                      </>
                    )}

                    {!isWorking && simulationResults[fn.name] !== undefined && (
                      <div css={simulationContainer}>
                        <Typography variant="body1" sx={{ fontWeight: 200 }}>
                          Simulation results:&nbsp;
                        </Typography>
                        {simulationResults[fn.name].success ? (
                          <Typography variant="body1">
                            {simulationResults?.[fn.name]?.data.length === 0
                              ? '-'
                              : simulationResults?.[fn.name].data.toString()}
                          </Typography>
                        ) : (
                          <Typography variant="body1" color="error">
                            {simulationResults?.[fn.name]?.error}
                          </Typography>
                        )}{' '}
                      </div>
                    )}
                    {isWorking ? <CircularProgress size={'1rem'} /> : <></>}
                  </CardContent>
                  <CardActions>
                    <Button
                      disabled={!wallet || !currentContract || isWorking}
                      color="secondary"
                      variant="contained"
                      size="small"
                      onClick={() => simulate(fn.name)}
                      endIcon={<PsychologyIcon />}
                    >
                      Simulate
                    </Button>
                    <Button
                      disabled={!wallet || !currentContract || isWorking || fn.functionType === 'unconstrained'}
                      size="small"
                      color="secondary"
                      variant="contained"
                      onClick={() => send(fn.name)}
                      endIcon={<SendIcon />}
                    >
                      Send
                    </Button>
                    <Button
                      disabled={!wallet || !currentContract || isWorking || fn.functionType === 'unconstrained'}
                      size="small"
                      color="secondary"
                      variant="contained"
                      onClick={() =>
                        handleAuthwitFnDataChanged(fn.name, parameters[fn.name], fn.functionType === 'private')
                      }
                      endIcon={<VpnKeyIcon />}
                    >
                      Authwit
                    </Button>
                  </CardActions>
                </Card>
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
