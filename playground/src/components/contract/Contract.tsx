import { css } from '@mui/styled-engine';
import { useContext, useEffect, useState } from 'react';
import {
  Contract,
  type ContractInstanceWithAddress,
  getAllFunctionAbis,
  type FunctionAbi,
  FunctionType,
  ContractFunctionInteraction,
  type SendMethodOptions,
} from '@aztec/aztec.js';
import { AztecContext } from '../../aztecEnv';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

import { formatFrAsString } from '../../utils/conversion';
import { DeployContractDialog } from './components/DeployContractDialog';
import ClearIcon from '@mui/icons-material/Clear';
import { RegisterContractDialog } from './components/RegisterContractDialog';
import { CopyToClipboardButton } from '../common/CopyToClipboardButton';
import { ContractUpload } from './components/ContractUpload';
import { ContractFilter } from './components/ContractFilter';
import { FunctionCard } from './components/FunctionCard';

const container = css({
  display: 'flex',
  height: '100%',
  width: '100%',
  overflow: 'hidden',
  justifyContent: 'center',
  alignItems: 'center',
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

const contractActions = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
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

  const [openDeployContractDialog, setOpenDeployContractDialog] = useState(false);
  const [openRegisterContractDialog, setOpenRegisterContractDialog] = useState(false);

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

  const handleContractCreation = async (contract?: ContractInstanceWithAddress, alias?: string) => {
    if (contract && alias) {
      await walletDB.storeContract(contract.address, currentContractArtifact, undefined, alias);
      setCurrentContract(await Contract.at(contract.address, currentContractArtifact, wallet));
      setCurrentContractAddress(contract.address);
    }
    setOpenDeployContractDialog(false);
    setOpenRegisterContractDialog(false);
  };

  const handleTx = async (name: string, interaction: ContractFunctionInteraction, opts: SendMethodOptions) => {
    let receipt;
    let txHash;
    const currentTx = {
      status: 'proving' as const,
      name,
      contractAddress: currentContract.address,
    };
    setCurrentTx(currentTx);
    try {
      const provenInteraction = await interaction.prove(opts);
      txHash = await provenInteraction.getTxHash();
      setCurrentTx({
        ...currentTx,
        ...{ txHash, status: 'sending' },
      });
      receipt = await provenInteraction.send().wait({ dontThrowOnRevert: true });
      await walletDB.storeTx({
        contractAddress: currentContract.address,
        txHash,
        name,
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
      setCurrentTx({
        ...currentTx,
        ...{
          txHash,
          status: 'error',
          error: e.message,
        },
      });
    }
  };

  return (
    <div css={container}>
      {!currentContractArtifact ? (
        !isLoadingArtifact ? (
          <ContractUpload />
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
            <ContractFilter filters={filters} onFilterChange={setFilters} />
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
              <FunctionCard fn={fn} key={fn.name} currentContract={currentContract} onSendTxRequested={handleTx} />
            ))}
        </div>
      )}
    </div>
  );
}
