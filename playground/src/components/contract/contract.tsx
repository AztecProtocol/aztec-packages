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

const container = css({
  display: 'flex',
  height: 'calc(100vh - 50px)',
  width: '100%',
  overflow: 'hidden',
  justifyContent: 'center',
  alignItems: 'center',
});

const dropZoneContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '80%',
  border: '3px dashed black',
  borderRadius: '15px',
  margin: '0rem 2rem 2rem 2rem',
});

const contractFnContainer = css({
  display: 'block',
  width: '100%',
  overflowY: 'auto',
  color: 'black',
  height: '100%',
});

const headerContainer = css({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  flexWrap: 'wrap',
  margin: '0 0.5rem',
  padding: '0.1rem',
  overflow: 'hidden',
  justifyContent: 'stretch',
  marginBottom: '0.5rem',
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

// Define predefined contract types - keep in sync with sidebar.tsx
const PREDEFINED_CONTRACTS = {
  SIMPLE_VOTING: 'simple_voting',
  SIMPLE_TOKEN: 'simple_token',
  CUSTOM_UPLOAD: 'custom_upload'
};

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
  const [functionAbis, setFunctionAbis] = useState<FunctionAbi[]>([]);

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
  } = useContext(AztecContext);

  useEffect(() => {
    console.log('Wallet:', wallet);
    console.log('Current Contract:', currentContract);
    console.log('Is Working:', isWorking);
  }, [wallet, currentContract, isWorking]);

  // Sort functions in a specific order for EasyPrivateVoting contract
  const sortFunctions = (functions: FunctionAbi[], contractName: string): FunctionAbi[] => {
    if (contractName === 'SimplePrivateVoting') {
      // Define the order fofr EasyPrivateVoting functions
      const order = ['constructor', 'cast_vote', 'end_vote', 'get_vote'];

      // Create a copy of the array to avoid mutating the original
      return [...functions].sort((a, b) => {
        const indexA = order.indexOf(a.name);
        const indexB = order.indexOf(b.name);

        // If both functions are in the order array, sort by their position
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }

        // If only one function is in the order array, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        // For functions not in the order array, maintain their original order
        return 0;
      });
    }

    // For other contracts, return the original array
    return functions;
  };

  // Load predefined contract artifacts
  useEffect(() => {
    const loadPredefinedContract = async () => {
      setIsLoadingArtifact(true);

      let contractArtifact;

      if (selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING) {
        try {
          // Use absolute path to the contract file in the public directory
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
          // For now, use the mock artifact since we don't have the real one
          contractArtifact = MOCK_SIMPLE_TOKEN_ARTIFACT as unknown as ContractArtifact;

          // When you have the real SimpleToken artifact, uncomment this line and import the file:
          // import SimpleToken from '../../assets/contracts/SimpleToken.json';
          // @ts-ignore - Add this comment when uncommenting
          // contractArtifact = loadContractArtifact(SimpleToken);
        } catch (err) {
          console.error('Error loading SimpleToken artifact:', err);
        }
      }

      if (contractArtifact) {
        console.log('Loaded contract artifact:', contractArtifact);
        setContractArtifact(contractArtifact);
        setFunctionAbis(sortFunctions(getAllFunctionAbis(contractArtifact), contractArtifact.name));
        setFilters({
          searchTerm: '',
          private: true,
          public: true,
          unconstrained: true,
        });

        // Use a valid placeholder Aztec address
        const mockAddress = AztecAddress.fromString('0x0000000000000000000000000000000000000000'); // Valid placeholder address
        const mockContract = await Contract.at(mockAddress, contractArtifact, wallet);

        console.log('Setting current contract:', contractArtifact.name);
        setCurrentContract(mockContract);
      }

      setIsLoadingArtifact(false);
    };

    if (selectedPredefinedContract) {
      loadPredefinedContract();
    }
  }, [selectedPredefinedContract]);

  // Load user's contract from address
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
      const file = files[0];
      const reader = new FileReader();
      setIsLoadingArtifact(true);
      reader.onload = async e => {
        const contractArtifact = loadContractArtifact(JSON.parse(e.target?.result as string));
        setContractArtifact(contractArtifact);
        setFunctionAbis(sortFunctions(getAllFunctionAbis(contractArtifact), contractArtifact.name));
        setIsLoadingArtifact(false);
      };
      reader.readAsText(file);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleParameterChange = (fnName: string, index: number, value: any) => {
    const fnParameters = parameters[fnName] || [];
    fnParameters[index] = value;
    setParameters({ ...parameters, [fnName]: fnParameters });
  };

  const handleContractDeployment = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    if (contract) {
      // Use the real contract address
      const deployedContract = await Contract.at(contract.address, contractArtifact, wallet);
      setCurrentContractAddress(deployedContract.address);
      setCurrentContract(deployedContract);
      // Save the contract in the wallet database
      await walletDB.storeContract(deployedContract.address, contractArtifact, undefined, alias);
    }
    setOpenDeployContractDialog(false);
  };

  const handleContractCreation = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    if (contract && alias) {
      await walletDB.storeContract(contract.address, contractArtifact, undefined, alias);
      setCurrentContract(await Contract.at(contract.address, contractArtifact, wallet));
      setCurrentContractAddress(contract.address);
    }
    setOpenDeployContractDialog(false);
    setOpenRegisterContractDialog(false);
  };

  const simulate = async (fnName: string) => {
    setIsWorking(true);
    let result;
    try {
      const fnParameters = parameters[fnName] ?? [];
      const call = currentContract.methods[fnName](...fnParameters);

      result = await call.simulate();
      setSimulationResults({
        ...simulationResults,
        ...{ [fnName]: { success: true, data: result } },
      });
    } catch (e) {
      setSimulationResults({
        ...simulationResults,
        ...{ [fnName]: { success: false, error: e.message } },
      });
    }

    setIsWorking(false);
  };

  const send = async (fnName: string) => {
    setIsWorking(true);
    let receipt;
    let txHash;
    const currentTx = {
      status: 'proving' as const,
      fnName: fnName,
      contractAddress: currentContract.address,
    };
    setCurrentTx(currentTx);
    try {
      const call = currentContract.methods[fnName](...parameters[fnName]);

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
      console.error(e);
      setCurrentTx({
        ...currentTx,
        ...{
          txHash,
          status: 'error',
          error: e.message,
        },
      });
    }

    setIsWorking(false);
  };

  const handleAuthwitFnDataChanged = (
    fnName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: any[],
    isPrivate: boolean,
  ) => {
    setAuthwitFnData({ name: fnName, parameters, isPrivate });
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
      {!contractArtifact ? (
        !isLoadingArtifact ? (
          <div css={dropZoneContainer}>
            <div {...getRootProps({ className: 'dropzone' })}>
              <input {...getInputProps()} />
              <Typography>Drag 'n' drop some files here, or click to select files</Typography>
            </div>
          </div>
        ) : (
          <div css={loadingArtifactContainer}>
            <Typography variant="h5">Loading artifact...</Typography>
            <CircularProgress size={100} />
          </div>
        )
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
