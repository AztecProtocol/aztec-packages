import { css } from '@mui/styled-engine';
import { useContext, useEffect, useState } from 'react';
import {
  Contract,
  type ContractInstanceWithAddress,
  getAllFunctionAbis,
  type FunctionAbi,
  FunctionType,
  DeployMethod,
  type DeployOptions,
} from '@aztec/aztec.js';
import { AztecContext } from '../../aztecEnv';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';

import { formatFrAsString } from '../../utils/conversion';
import { CreateContractDialog } from './components/CreateContractDialog';
import ClearIcon from '@mui/icons-material/Clear';
import { CopyToClipboardButton } from '../common/CopyToClipboardButton';
import { ContractUpload } from './components/ContractUpload';
import { ContractFilter } from './components/ContractFilter';
import { FunctionCard } from './components/FunctionCard';
import { useTransaction } from '../../hooks/useTransaction';

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

const contractName = css({
  marginRight: '0.5rem',
  '@media (max-width: 1200px)': {
    fontSize: '1.5rem',
  },
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

  const [openCreateContractDialog, setOpenCreateContractDialog] = useState(false);

  const { sendTx } = useTransaction();

  const {
    node,
    wallet,
    currentContractAddress,
    currentContractArtifact,
    setCurrentContractArtifact,
    setCurrentContractAddress,
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
      if (currentContractAddress) {
        const { isContractPubliclyDeployed } = await wallet.getContractMetadata(currentContractAddress);
        // Temporarily filter out undeployed contracts
        if (isContractPubliclyDeployed) {
          const contractInstance = await node.getContract(currentContractAddress);
          await wallet.registerContract({ instance: contractInstance, artifact: currentContractArtifact });
          const contract = await Contract.at(currentContractAddress, currentContractArtifact, wallet);
          setCurrentContract(contract);
        }
      }
      setIsLoadingArtifact(false);
    };
    if (!!currentContractArtifact) {
      loadCurrentContract();
    }
  }, [currentContractArtifact, currentContractAddress, wallet]);

  const handleContractCreation = async (
    contract?: ContractInstanceWithAddress,
    publiclyDeploy?: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) => {
    setOpenCreateContractDialog(false);
    if (contract && publiclyDeploy) {
      const deploymentResult = await sendTx(
        `deploy ${currentContractArtifact.name}`,
        interaction,
        contract.address,
        opts,
      );
      // Temporarily ignore undeployed contracts
      if (deploymentResult) {
        setCurrentContractAddress(contract.address);
      }
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
              <Typography variant="h3" css={contractName}>
                {currentContractArtifact.name}
              </Typography>
              {!currentContractAddress && wallet && (
                <div css={contractActions}>
                  <Button size="small" variant="contained" onClick={() => setOpenCreateContractDialog(true)}>
                    Register/Deploy
                  </Button>
                  {openCreateContractDialog && (
                    <CreateContractDialog
                      contractArtifact={currentContractArtifact}
                      open={openCreateContractDialog}
                      onClose={handleContractCreation}
                    />
                  )}
                </div>
              )}
              {currentContractAddress && (
                <div css={contractActions}>
                  <Typography color="text.secondary">{formatFrAsString(currentContractAddress.toString())}</Typography>
                  <CopyToClipboardButton disabled={false} data={currentContractAddress.toString()} />
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
              <FunctionCard fn={fn} key={fn.name} contract={currentContract} onSendTxRequested={sendTx} />
            ))}
        </div>
      )}
    </div>
  );
}
