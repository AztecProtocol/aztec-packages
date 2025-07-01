import { useState, useEffect, useContext } from 'react';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { CopyToClipboardButton } from '../../common/CopyToClipboardButton';
import {
  convertFromUTF8BufferAsString,
  formatFrAsString,
  parseAliasedBuffersAsString,
} from '../../../utils/conversion';
import { PREDEFINED_CONTRACTS } from '../../../utils/types';
import { AztecContext } from '../../../aztecEnv';
import { AztecAddress, loadContractArtifact } from '@aztec/aztec.js';
import { parse } from 'buffer-json';
import { navbarButtonStyle, navbarSelect, navbarSelectLabel } from '../../../styles/common';
import { filterDeployedAliasedContracts } from '../../../utils/contracts';
import ArticleIcon from '@mui/icons-material/Article';
import { InputLabel } from '@mui/material';
import { trackButtonClick } from '../../../utils/matomo';

export function ContractSelector() {
  const [contracts, setContracts] = useState([]);

  const [isContractsLoading, setIsContractsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const [selectedPredefinedContract, setSelectedPredefinedContract] = useState<string | undefined>(undefined);

  const {
    currentContractAddress,
    wallet,
    walletDB,
    isPXEInitialized,
    pendingTxUpdateCounter,
    setCurrentContractArtifact,
    setCurrentContractAddress,
    setShowContractInterface,
    setDefaultContractCreationParams,
  } = useContext(AztecContext);

  useEffect(() => {
    const refreshContracts = async () => {
      setIsContractsLoading(true);
      const aliasedContracts = await walletDB.listAliases('contracts');
      const contracts = parseAliasedBuffersAsString(aliasedContracts);
      // Temporarily filter out undeployed contracts
      const deployedContracts = await filterDeployedAliasedContracts(contracts, wallet);
      setContracts(deployedContracts);
      setIsContractsLoading(false);
    };

    if (walletDB && wallet) {
      refreshContracts();
    }
  }, [currentContractAddress, walletDB, wallet, pendingTxUpdateCounter]);

  const handleContractChange = async (event: SelectChangeEvent) => {
    const contractValue = event.target.value;
    if (contractValue === '') {
      return;
    }

    trackButtonClick(`Contract Change`, 'Contract Selector');

    // If 'upload your own' is selected, set the contract artifact to undefined, and allow the user to upload a new one
    if (contractValue === PREDEFINED_CONTRACTS.CUSTOM_UPLOAD) {
      setCurrentContractArtifact(undefined);
      setCurrentContractAddress(undefined);
      setSelectedPredefinedContract(contractValue);
      setShowContractInterface(true);
      return;
    }

    setIsContractsLoading(true);
    setDefaultContractCreationParams({});

    try {
      if ([PREDEFINED_CONTRACTS.SIMPLE_VOTING, PREDEFINED_CONTRACTS.SIMPLE_TOKEN].includes(contractValue)) {
        let contractArtifactJSON;
        switch (contractValue) {
          case PREDEFINED_CONTRACTS.SIMPLE_VOTING:
            ({ EasyPrivateVotingContractArtifact: contractArtifactJSON } = await import(
              '@aztec/noir-contracts.js/EasyPrivateVoting'
            ));
            break;
          case PREDEFINED_CONTRACTS.SIMPLE_TOKEN:
            ({ SimpleTokenContractArtifact: contractArtifactJSON } = await import(
              '@aztec/noir-contracts.js/SimpleToken'
            ));
            break;
        }
        const contractArtifact = await loadContractArtifact(contractArtifactJSON);
        setSelectedPredefinedContract(contractValue);
        setCurrentContractArtifact(contractArtifact);
        setCurrentContractAddress(undefined);
        setShowContractInterface(true);
      } else {
        const artifactAsString = await walletDB.retrieveAlias(`artifacts:${contractValue}`);
        const contractArtifact = loadContractArtifact(parse(convertFromUTF8BufferAsString(artifactAsString)));
        setCurrentContractAddress(AztecAddress.fromString(contractValue));
        setCurrentContractArtifact(contractArtifact);
        setSelectedPredefinedContract(undefined);
        setShowContractInterface(true);
      }
    } finally {
      setIsContractsLoading(false);
    }
  };

  const selectedValue = currentContractAddress?.toString() || selectedPredefinedContract || '';

  if (isContractsLoading) {
    return (
      <div css={navbarButtonStyle}>
        <CircularProgress size={24} color="primary" sx={{ marginRight: '1rem' }} />
        <Typography variant="body1">Loading contract...</Typography>
      </div>
    );
  }

  return (
    <div css={navbarButtonStyle}>
      <ArticleIcon />

      <FormControl css={navbarSelect}>
        {!selectedValue && (
          <InputLabel id="contract-label">Select Contract</InputLabel>
        )}

        <Select
          value={selectedValue || ''}
          label="Contract"
          open={isOpen}
          onOpen={() => setIsOpen(true)}
          onClose={() => setIsOpen(false)}
          onChange={handleContractChange}
          fullWidth
          renderValue={selected => {
            const contract = contracts.find(contract => contract.value === selected);
            if (contract) {
              return `${contract?.key.split(':')[1]} (${formatFrAsString(contract?.value)})`;
            }
            if (selected === PREDEFINED_CONTRACTS.CUSTOM_UPLOAD) {
              return 'Upload Your Own';
            }
            return selected ?? 'Select Contract';
          }}
          disabled={isContractsLoading}
        >
          {(!isPXEInitialized || !wallet) && (
            <div css={navbarSelectLabel}>
              <Typography variant="body2" color="warning.main">
                Note: Connect to a network and account to deploy and interact with contracts
              </Typography>
            </div>
          )}

          {/* Predefined contracts */}
          <MenuItem value={PREDEFINED_CONTRACTS.SIMPLE_VOTING}>Easy Private Voting</MenuItem>
          <MenuItem value={PREDEFINED_CONTRACTS.SIMPLE_TOKEN}>Simple Token</MenuItem>

          <Divider />
          {/* Upload your own option - always present */}
          <MenuItem value={PREDEFINED_CONTRACTS.CUSTOM_UPLOAD}>
            <UploadFileIcon sx={{ mr: 1, position: 'relative', top: '0.2rem' }} fontSize="small" />
            Upload Your Own
          </MenuItem>

          <Divider />
          {/* User's deployed/registered contracts */}
          {contracts.length > 0 && <ListSubheader>Deployed Contracts</ListSubheader>}
          {contracts.map(contract => (
            <MenuItem key={`${contract.key}-${contract.value}`} value={contract.value}>
              {contract.key.split(':')[1]}&nbsp;(
              {formatFrAsString(contract.value)})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {currentContractAddress && (
        <CopyToClipboardButton disabled={!currentContractAddress} data={currentContractAddress?.toString()} />
      )}
    </div>
  );
}
