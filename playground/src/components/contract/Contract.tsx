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
import { formatFrAsString } from '../../utils/conversion';
import { DeployContractDialog } from './components/deployContractDialog';
import { FunctionParameter } from '../common/FnParameter';
import ClearIcon from '@mui/icons-material/Clear';
import { RegisterContractDialog } from './components/registerContractDialog';
import { CopyToClipboardButton } from '../common/CopyToClipboardButton';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import SendIcon from '@mui/icons-material/Send';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { CreateAuthwitDialog } from './components/createAuthwitDialog';

const container = css({
  display: 'flex',
  height: '100%',
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

export function ContractComponent() {
  const [currentContract, setCurrentContract] = useState<Contract | null>(null);
  const [functionAbis, setFunctionAbis] = useState<FunctionAbi[]>([]);

  const [filters, setFilters] = useState({
    searchTerm: '',
    private: true,
    public: true,
    utility: true,
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
    currentContractArtifact,
    setCurrentContractArtifact,
    setCurrentContractAddress,
    setCurrentTx,
  } = useContext(AztecContext);

  useEffect(() => {
    const loadCurrentContract = async () => {
      setIsLoadingArtifact(true);
      setFunctionAbis(getAllFunctionAbis(currentContractArtifact));
      setFilters({
        searchTerm: '',
        private: true,
        public: true,
        utility: true,
      });
      if (currentContractAddress && currentContract?.address !== currentContractAddress) {
        const contract = await Contract.at(currentContractAddress, currentContractArtifact, wallet);
        setCurrentContract(contract);
      } else {
        setCurrentContract(null);
      }
      setIsLoadingArtifact(false);
    };
    if (!!currentContractArtifact) {
      loadCurrentContract();
    }
  }, [currentContractArtifact, currentContractAddress]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: async files => {
      const file = files[0];
      const reader = new FileReader();
      setIsLoadingArtifact(true);
      reader.onload = async e => {
        const contractArtifact = loadContractArtifact(JSON.parse(e.target?.result as string));
        setCurrentContractArtifact(contractArtifact);
        setFunctionAbis(getAllFunctionAbis(contractArtifact));
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

  const handleContractCreation = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    if (contract && alias) {
      await walletDB.storeContract(contract.address, currentContractArtifact, undefined, alias);
      setCurrentContract(await Contract.at(contract.address, currentContractArtifact, wallet));
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
      {!currentContractArtifact ? (
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
                {currentContractArtifact.name}
              </Typography>
              {!currentContract && wallet && (
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
                    contractArtifact={currentContractArtifact}
                    open={openDeployContractDialog}
                    onClose={handleContractCreation}
                  />
                  <RegisterContractDialog
                    contractArtifact={currentContractArtifact}
                    open={openRegisterContractDialog}
                    onClose={handleContractCreation}
                  />
                </div>
              )}
              {currentContract && (
                <div css={contractActions}>
                  <Typography color="text.secondary">{formatFrAsString(currentContract.address.toString())}</Typography>
                  <CopyToClipboardButton disabled={false} data={currentContract.address.toString()} />
                  <IconButton
                    onClick={() => {
                      setCurrentContractAddress(null);
                      setCurrentContract(null);
                      setCurrentContractArtifact(null);
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
                        checked={filters.utility}
                        onChange={e =>
                          setFilters({
                            ...filters,
                            utility: e.target.checked,
                          })
                        }
                      />
                    }
                    label="Utility"
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
                ((filters.private && fn.functionType === FunctionType.PRIVATE) ||
                  (filters.public && fn.functionType === FunctionType.PUBLIC) ||
                  (filters.utility && fn.functionType === FunctionType.UTILITY)) &&
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
                    disabled={!wallet || !currentContract || isWorking || fn.functionType === FunctionType.UTILITY}
                    size="small"
                    color="secondary"
                    variant="contained"
                    onClick={() => send(fn.name)}
                    endIcon={<SendIcon />}
                  >
                    Send
                  </Button>
                  <Button
                    disabled={!wallet || !currentContract || isWorking || fn.functionType === FunctionType.UTILITY}
                    size="small"
                    color="secondary"
                    variant="contained"
                    onClick={() =>
                      handleAuthwitFnDataChanged(fn.name, parameters[fn.name], fn.functionType === FunctionType.PRIVATE)
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
