import { css } from '@mui/styled-engine';
import { useContext, useState } from 'react';
import { Contract, AztecAddress } from '@aztec/aztec.js';
import type { ContractArtifact, FunctionAbi } from '@aztec/aztec.js';
import { AztecContext } from '../../../aztecEnv';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { ContractUpload } from './ContractUpload';
import { ContractHeader } from './ContractHeader';
import { ContractFilter } from './ContractFilter';
import { FunctionCard } from './FunctionCard';
import { CreateAuthwitDialog } from './createAuthwitDialog';
import { LoadingModal } from '../../common/LoadingModal';
import { PREDEFINED_CONTRACTS, FUNCTION_DESCRIPTIONS } from '../constants';
import { useContractArtifact, useContractFunctions, useContractDeployment } from '../hooks';
import { getAllFunctionAbis } from '@aztec/aztec.js';

const container = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  background: '#E9E9E9',
  borderRadius: '10px',
  padding: '45px',
  overflow: 'hidden',
  '@media (max-width: 1100px)': {
    width: 'auto',
    padding: '24px',
  },
});

const contractFnContainer = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  flex: '1 1 auto',
  height: '0',
  minHeight: '0',
  overflow: 'auto',
});

const tokenSection = css({
  marginTop: '50px',
  marginBottom: '25px',
});

const tokenHeader = css({
  fontFamily: '"Space Grotesk", sans-serif',
  fontStyle: 'normal',
  fontWeight: 700,
  fontSize: '48px',
  lineHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  letterSpacing: '0.02em',
  color: '#2D2D2D',
  marginBottom: '25px',
});

const functionListContainer = css({
  width: '100%',
  padding: '0',
});

const loadingArtifactContainer = css({
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'center',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2rem',
  height: '100%',
});

export function ContractComponent() {
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
  } = useContext(AztecContext);

  const [showUploadArea, setShowUploadArea] = useState(false);
  const [openDeployContractDialog, setOpenDeployContractDialog] = useState(false);
  const [openRegisterContractDialog, setOpenRegisterContractDialog] = useState(false);
  const [openCreateAuthwitDialog, setOpenCreateAuthwitDialog] = useState(false);
  const [authwitFnData, setAuthwitFnData] = useState({
    name: '',
    parameters: [],
    isPrivate: false,
  });

  const [filters, setFilters] = useState({
    searchTerm: '',
    private: true,
    public: true,
    utility: true,
  });

  const [simulationResults, setSimulationResults] = useState({});
  const [parameters, setParameters] = useState({});

  const { contractArtifact, functionAbis, isLoadingArtifact, setContractArtifact, setFunctionAbis } = useContractArtifact(
    selectedPredefinedContract,
    wallet
  );

  const filteredFunctions = useContractFunctions(functionAbis, filters);

  const { handleContractDeployment } = useContractDeployment(
    contractArtifact,
    wallet,
    walletDB,
    setCurrentContract,
    setCurrentContractAddress,
    setCurrentTx,
    setIsWorking
  );

  const handleParameterChange = (fnName: string, index: number, value: any) => {
    const fnParameters = parameters[fnName] || [];
    fnParameters[index] = value;
    setParameters({ ...parameters, [fnName]: fnParameters });
  };

  const simulate = async (fnName: string) => {
    if (!currentContract) {
      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: 'You need to deploy this contract before you can simulate functions',
        contractAddress: null
      });
      return;
    }

    setIsWorking(true);
    try {
      const fnParameters = parameters[fnName] ?? [];
      const call = currentContract.methods[fnName](...fnParameters);
      const result = await call.simulate();

      setSimulationResults({
        ...simulationResults,
        ...{ [fnName]: { success: true, data: result } },
      });
    } catch (error) {
      setSimulationResults({
        ...simulationResults,
        ...{ [fnName]: { success: false, error: error.message } },
      });

      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: error.message || 'Simulation failed',
        contractAddress: currentContract.address
      });
    } finally {
      setIsWorking(false);
    }
  };

  const send = async (fnName: string) => {
    if (!currentContract) {
      setCurrentTx({
        status: 'error' as const,
        fnName: fnName,
        error: 'You need to deploy this contract before you can send transactions',
        contractAddress: null
      });
      return;
    }

    setIsWorking(true);
    const currentTx = {
      status: 'proving' as const,
      fnName: fnName,
      contractAddress: currentContract.address,
    };
    setCurrentTx(currentTx);

    try {
      const fnParameters = parameters[fnName] || [];
      const call = currentContract.methods[fnName](...fnParameters);
      const provenCall = await call.prove();
      const txHash = await provenCall.getTxHash();

      setCurrentTx({
        ...currentTx,
        ...{ txHash, status: 'sending' },
      });

      const receipt = await provenCall.send().wait({ dontThrowOnRevert: true });

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
    } catch (error) {
      setCurrentTx({
        ...currentTx,
        status: 'error' as const,
        error: error.message || 'Transaction failed',
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleAuthwitFnDataChanged = (fnName: string, parameters: any[], isPrivate: boolean) => {
    setAuthwitFnData({ name: fnName, parameters, isPrivate });
    setOpenCreateAuthwitDialog(true);
  };

  const handleAuthwitCreation = async (witness?: any, alias?: string) => {
    if (witness && alias) {
      await walletDB.storeAuthwitness(witness, undefined, alias);
    }
    setAuthwitFnData({ name: '', parameters: [], isPrivate: false });
    setOpenCreateAuthwitDialog(false);
  };

  const handleShowNetworkConnect = () => {
    window.dispatchEvent(new CustomEvent('aztec:showNetworkConnect'));
  };

  return (
    <div css={container}>
      <LoadingModal />
      {showUploadArea ? (
        <ContractUpload
          onContractLoaded={(artifact) => {
            setContractArtifact(artifact);
            setFunctionAbis(getAllFunctionAbis(artifact));
            setShowUploadArea(false);
          }}
          onDeployRequested={() => setOpenDeployContractDialog(true)}
          isLoading={isLoadingArtifact}
          wallet={wallet}
        />
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
          <ContractHeader
            selectedPredefinedContract={selectedPredefinedContract}
            nodeURL={nodeURL}
            contractArtifact={contractArtifact}
            onDeployRequested={() => setOpenDeployContractDialog(true)}
            onRegisterRequested={() => setOpenRegisterContractDialog(true)}
            openDeployContractDialog={openDeployContractDialog}
            openRegisterContractDialog={openRegisterContractDialog}
            onDeployClose={handleContractDeployment}
            onRegisterClose={handleContractDeployment}
          />

          <div css={tokenSection}>
            <div css={tokenHeader}>
              {selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_VOTING ? 'Simple Private Voting' :
               selectedPredefinedContract === PREDEFINED_CONTRACTS.SIMPLE_TOKEN ? 'Simple Token' :
               contractArtifact?.name || 'Contract'}
            </div>
            <ContractFilter
              filters={filters}
              onFilterChange={setFilters}
            />
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

          <div css={functionListContainer}>
            {functionAbis.length === 0 && contractArtifact && (
              <div style={{ padding: '20px', margin: '10px 0', textAlign: 'center', backgroundColor: 'rgba(255, 235, 59, 0.1)', borderRadius: '8px' }}>
                <Typography variant="subtitle1" style={{ color: '#FF9800' }}>
                  No functions found for this contract. Please check the console for debugging information.
                </Typography>
              </div>
            )}
            {filteredFunctions.map(fn => (
              <FunctionCard
                key={fn.name}
                fn={fn}
                onParameterChange={handleParameterChange}
                onSimulate={simulate}
                onSend={send}
                onAuthwit={handleAuthwitFnDataChanged}
                simulationResults={simulationResults}
                isWorking={isWorking}
                wallet={wallet}
                currentContract={currentContract}
                parameters={parameters}
                functionDescriptions={FUNCTION_DESCRIPTIONS}
                selectedPredefinedContract={selectedPredefinedContract}
              />
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
