import { useState, useEffect, useContext } from 'react';
import InputLabel from '@mui/material/InputLabel';
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
import { css } from '@emotion/react';
import { AztecContext } from '../../../aztecEnv';
import { AztecAddress, loadContractArtifact } from '@aztec/aztec.js';
import { parse } from 'buffer-json';
import { select } from '../../../styles/common';
import { filterDeployedAliasedContracts } from '../../../utils/contracts';

const modalContainer = css({
  padding: '10px 0',
});

const loadingContainer = css({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexDirection: 'column',
  padding: '20px 0',
  gap: '12px',
});

export function ContractSelector() {
  const [contracts, setContracts] = useState([]);

  const [isContractsLoading, setIsContractsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const [selectedPredefinedContract, setSelectedPredefinedContract] = useState<string | undefined>(undefined);

  const {
    pxe,
    currentContractAddress,
    wallet,
    walletDB,
    isPXEInitialized,
    setCurrentContractArtifact,
    setCurrentContractAddress,
    setShowContractInterface,
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
  }, [currentContractAddress, walletDB, wallet]);

  const handleContractChange = async (event: SelectChangeEvent) => {
    const contractValue = event.target.value;
    if (contractValue === '') {
      return;
    }

    // If 'upload your own' is selected, set the contract artifact to undefined, and allow the user to upload a new one
    if (contractValue === PREDEFINED_CONTRACTS.CUSTOM_UPLOAD) {
      setCurrentContractArtifact(undefined);
      setCurrentContractAddress(undefined);
      setSelectedPredefinedContract(contractValue);
      setShowContractInterface(true);
      return;
    }

    setIsContractsLoading(true);

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

  if (!isPXEInitialized || !wallet) {
    return (
      <div css={loadingContainer}>
        <Typography variant="body2" color="warning.main">
          Note: Connect to a network and account to deploy and interact with contracts
        </Typography>
      </div>
    );
  }

  return (
    <div css={modalContainer}>
      <FormControl css={select}>
        <InputLabel>Contracts</InputLabel>
        <Select
          value={currentContractAddress?.toString() || selectedPredefinedContract || ''}
          label="Contract"
          open={isOpen}
          onOpen={() => setIsOpen(true)}
          onClose={() => setIsOpen(false)}
          onChange={handleContractChange}
          fullWidth
          disabled={isContractsLoading}
        >
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
        {isContractsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.5rem' }}>
            <CircularProgress size={20} />
          </div>
        ) : (
          <CopyToClipboardButton disabled={!currentContractAddress} data={currentContractAddress?.toString()} />
        )}
      </FormControl>
    </div>
  );
}
