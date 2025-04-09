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
import { select } from '../styles';
import { formatFrAsString, parseAliasedBuffersAsString } from '../../../utils/conversion';
import { PREDEFINED_CONTRACTS } from '../types';
import { css } from '@emotion/react';
import { AztecContext } from '../../../aztecEnv';

const modalContainer = css({
  padding: '10px 0',
});

const buttonContainer = css({
  marginTop: '15px',
});

const loadingContainer = css({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexDirection: 'column',
  padding: '20px 0',
  gap: '12px',
});

interface ContractSelectorProps {}

export function ContractSelector({}: ContractSelectorProps) {
  const [contracts, setContracts] = useState([]);

  const [isContractChanging, setIsContractChanging] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const {
    setCurrentContract,
    setCurrentContractAddress,
    currentContractAddress,
    wallet,
    walletDB,
    setShowContractInterface,
  } = useContext(AztecContext);

  useEffect(() => {
    const refreshContracts = async () => {
      const aliasedContracts = await walletDB.listAliases('contracts');
      setContracts(parseAliasedBuffersAsString(aliasedContracts));
    };
    if (walletDB) {
      refreshContracts();
    }
  }, [currentContractAddress, walletDB]);

  const handleContractChange = async (event: SelectChangeEvent) => {
    const contractValue = event.target.value;
    if (contractValue === '') {
      return;
    }

    // If 'create' is clicked, don't proceed (it's just for showing the dialog)
    if (contractValue === 'create') {
      return;
    }

    setIsContractChanging(true);

    try {
      if ([PREDEFINED_CONTRACTS.SIMPLE_VOTING, PREDEFINED_CONTRACTS.SIMPLE_TOKEN].includes(contractValue)) {
        setShowContractInterface(true);
        let contract;
        switch (contractValue) {
          case PREDEFINED_CONTRACTS.SIMPLE_VOTING:
            contract = await import(`@aztec/noir-contracts.js/EasyPrivateVoting`);
            break;
          case PREDEFINED_CONTRACTS.SIMPLE_TOKEN:
            contract = await import(`@aztec/noir-contracts.js/SimpleToken`);
            break;
        }
        setCurrentContract(contract);
        return;
      }
    } finally {
      setIsContractChanging(false);
    }
  };

  return (
    <div css={modalContainer}>
      <FormControl css={select}>
        <InputLabel>Contracts</InputLabel>
        <Select
          value={currentContractAddress?.toString() || ''}
          label="Contract"
          open={isOpen}
          onOpen={() => setIsOpen(true)}
          onClose={() => setIsOpen(false)}
          onChange={handleContractChange}
          fullWidth
          disabled={isContractChanging}
        >
          {/* Predefined contracts */}
          <MenuItem value={PREDEFINED_CONTRACTS.SIMPLE_VOTING}>Easy Private Voting</MenuItem>
          <MenuItem value={PREDEFINED_CONTRACTS.SIMPLE_TOKEN}>Simple Token</MenuItem>

          <Divider />
          {/* Upload your own option - always present */}
          <MenuItem value={PREDEFINED_CONTRACTS.CUSTOM_UPLOAD} sx={{ display: 'flex', alignItems: 'center' }}>
            <UploadFileIcon fontSize="small" sx={{ mr: 1 }} />
            Upload Your Own
          </MenuItem>

          <Divider />
          {/* User's deployed/registered contracts */}
          {contracts.length > 0 && (
            <>
              <ListSubheader>Deployed Contracts</ListSubheader>
              {contracts.map(contract => (
                <MenuItem key={`${contract.key}-${contract.value}`} value={contract.value}>
                  {contract.key.split(':')[1]}&nbsp;(
                  {formatFrAsString(contract.value)})
                </MenuItem>
              ))}
            </>
          )}
        </Select>
        {isContractChanging ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <CircularProgress size={20} />
          </div>
        ) : (
          <CopyToClipboardButton disabled={!currentContractAddress} data={currentContractAddress?.toString()} />
        )}
      </FormControl>
      {!wallet && (
        <div css={loadingContainer}>
          <Typography variant="body2" color="warning.main">
            Note: Connect to a network and account to deploy and interact with contracts
          </Typography>
        </div>
      )}
    </div>
  );
}
