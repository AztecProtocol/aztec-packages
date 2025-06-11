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
  TxStatus,
  getContractClassFromArtifact,
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
import { ContractDescriptions, ContractDocumentationLinks, ContractMethodOrder } from '../../utils/constants';
import Box from '@mui/material/Box';
import { trackButtonClick } from '../../utils/matomo';

const container = css({
  display: 'flex',
  height: '100%',
  width: '100%',
  overflow: 'hidden',
  justifyContent: 'center',
  alignItems: 'center',
  maxHeight: 'calc(100vh - 280px)',
  '@media (max-width: 900px)': {
    maxHeight: 'none',
    height: 'auto',
  },
});

const contractFnContainer = css({
  display: 'block',
  width: '100%',
  overflowY: 'auto',
  color: 'black',
  height: '100%',
  '@media (max-width: 900px)': {
    height: 'auto',
  },
  border: 'none',
});

const headerContainer = css({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  flexWrap: 'wrap',
  // margin: '0 0.5rem',
  // padding: '0.1rem',
  overflow: 'hidden',
  justifyContent: 'stretch',
  marginBottom: '0.5rem',
});

const header = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
});

const titleContainer = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  '@media (max-width: 900px)': {
    gap: '1rem',
    flexWrap: 'wrap',
  },
});

const contractActions = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  minWidth: '150px',
});

const deployButton = css({
  background: '#8C7EFF',
  height: '30px',
  fontSize: '14px',
  fontWeight: 600,
  padding: '20px 16px',
  borderRadius: '6px',
  '@media (max-width: 900px)': {
    padding: '4px',
    height: 'auto',
  },
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
  fontSize: '2.0rem',
  '@media (max-width: 900px)': {
    fontSize: '1.5rem',
  },
});

const contractClassIdCss = css({
  marginBottom: '1rem',
  marginTop: '0.5rem',
  backgroundColor: 'rgba(255, 255, 255, 0.22)',
  padding: '0px 5px',
  borderRadius: '3px',
});

const deployedContractCss = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'var(--mui-palette-grey-200)',
  padding: '0px 12px',
  borderRadius: '6px',
  '@media (max-width: 900px)': {
    padding: '0px 10px',
    width: '100%',
    marginBottom: '1rem',
    '& > p': {
      fontSize: '0.9rem',
    },
    '& svg': {
      width: '1.2rem',
      height: '1.2rem',
    },
  },
});

const FORBIDDEN_FUNCTIONS = ['process_log', 'sync_private_state', 'public_dispatch'];

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
    defaultContractCreationParams,
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
    if (currentContractArtifact) {
      loadCurrentContract();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContractArtifact, currentContractAddress, wallet]);

  useEffect(() => {
    if (!currentContractAddress) {
      setOpenCreateContractDialog(true);
    }
  }, [currentContractAddress]);

  const handleContractCreation = async (
    contract?: ContractInstanceWithAddress,
    publiclyDeploy?: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) => {
    setOpenCreateContractDialog(false);
    if (contract && publiclyDeploy) {
      const txReceipt = await sendTx(
        `Deploy ${currentContractArtifact.name}`,
        interaction,
        contract.address,
        opts,
      );
      // Temporarily ignore undeployed contracts
      if (txReceipt?.status === TxStatus.SUCCESS) {
        setCurrentContractAddress(contract.address);
      }
    } else if (contract) {
      setCurrentContractAddress(contract.address);
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
              <Box sx={titleContainer}>
                <Typography variant="h3" css={contractName}>
                  {currentContractArtifact.name}
                </Typography>

                {!currentContractAddress && wallet && (
                  <div css={contractActions}>
                    <Button
                      size="small"
                      variant="contained"
                      css={deployButton}
                      onClick={() => {
                        trackButtonClick('Deploy/Load Contract', 'Contract Actions');
                        setOpenCreateContractDialog(true);
                      }}
                    >
                      Deploy / Load Contract
                    </Button>
                    {openCreateContractDialog && (
                      <CreateContractDialog
                        contractArtifact={currentContractArtifact}
                        open={openCreateContractDialog}
                        onClose={handleContractCreation}
                        defaultContractCreationParams={defaultContractCreationParams}
                      />
                    )}
                  </div>
                )}

                {currentContractAddress && (
                  <div css={deployedContractCss}>
                    <Typography color="text.secondary">
                      {formatFrAsString(currentContractAddress.toString())}
                    </Typography>
                    <div>
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
                  </div>
                )}
              </Box>

              <Typography variant="caption" css={contractClassIdCss}>
                Contract Class ID: {currentContract?.instance?.currentContractClassId.toString()}
              </Typography>

              {!!ContractDescriptions[currentContractArtifact.name] && (
                <Typography variant="body2" css={{ marginBottom: '2rem' }}>
                  {ContractDescriptions[currentContractArtifact.name]}
                </Typography>
              )}
              {!!ContractDocumentationLinks[currentContractArtifact.name] && (
                <Typography variant="body2" css={{ marginTop: '-1.5rem', marginBottom: '2rem' }}>
                  <span>Find the in-depth tutorial for {currentContractArtifact.name} </span>
                  <a
                    href={ContractDocumentationLinks[currentContractArtifact.name]}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    here
                  </a>
                </Typography>
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
            .sort((a, b) => {
              if (ContractMethodOrder[currentContractArtifact.name]) {
                return (
                  ContractMethodOrder[currentContractArtifact.name]?.indexOf(a.name) -
                  ContractMethodOrder[currentContractArtifact.name]?.indexOf(b.name)
                );
              }
              return 0;
            })
            .map(fn => (
              <FunctionCard
                fn={fn}
                key={fn.name}
                contract={currentContract}
                contractArtifact={currentContractArtifact}
                onSendTxRequested={sendTx}
              />
            ))}
        </div>
      )}
    </div>
  );
}
