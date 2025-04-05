import { useState, useEffect } from 'react';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { CopyToClipboardButton } from '../../common/copyToClipboardButton';
import { select, primaryButton } from '../styles';
import { formatFrAsString } from '../../../utils/conversion';
import { PREDEFINED_CONTRACTS } from '../types';
import type { AliasedItem } from '../types';
import { AztecAddress, AccountWalletWithSecretKey } from '@aztec/aztec.js';
import { setContract } from '../utils/contractHelpers';
import { AddSendersDialog } from './addSenderDialog';
import type { WalletDB } from '../../../utils/storage';
import { css } from '@emotion/react';

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

interface ContractSelectorProps {
  contracts: AliasedItem[];
  currentContractAddress: AztecAddress | null;
  selectedPredefinedContract: string;
  wallet: AccountWalletWithSecretKey | null;
  walletDB: WalletDB | null;
  setSelectedPredefinedContract: (contract: string) => void;
  setCurrentContractAddress: (address: AztecAddress | null) => void;
  setShowContractInterface: (show: boolean) => void;
  onAccountsChange: () => void;
}

export function ContractSelector({
  contracts,
  currentContractAddress,
  selectedPredefinedContract,
  wallet,
  walletDB,
  setSelectedPredefinedContract,
  setCurrentContractAddress,
  setShowContractInterface,
  onAccountsChange
}: ContractSelectorProps) {
  const [openAddSendersDialog, setOpenAddSendersDialog] = useState(false);
  const [isContractChanging, setIsContractChanging] = useState(false);

  const handleContractChange = (event: SelectChangeEvent) => {
    const contractValue = event.target.value;
    setIsContractChanging(true);

    try {
      if (contractValue === PREDEFINED_CONTRACTS.SIMPLE_VOTING ||
          contractValue === PREDEFINED_CONTRACTS.SIMPLE_TOKEN ||
          contractValue === PREDEFINED_CONTRACTS.CUSTOM_UPLOAD) {
        setContract(
          null,
          setSelectedPredefinedContract,
          setCurrentContractAddress,
          setShowContractInterface,
          contractValue
        );
        return;
      }

      if (contractValue === '') {
        return;
      }

      setContract(
        contractValue,
        setSelectedPredefinedContract,
        setCurrentContractAddress,
        setShowContractInterface
      );
    } finally {
      setIsContractChanging(false);
    }
  };

  const handleSenderAdded = async (sender?: AztecAddress, alias?: string) => {
    if (!wallet || !walletDB) return;

    if (sender && alias) {
      await wallet.registerSender(sender);
      await walletDB.storeAlias('accounts', alias, Buffer.from(sender.toString()));
      onAccountsChange();
    }
    setOpenAddSendersDialog(false);
  };

  const handleShowContractInterface = () => {
    setShowContractInterface(true);
  };

  return (
    <div css={modalContainer} style={{ opacity: wallet ? 1 : 0.5 }}>
      <FormControl css={select}>
        <InputLabel>Contracts</InputLabel>
        <Select
          value={selectedPredefinedContract || currentContractAddress?.toString() || ''}
          label="Contract"
          onChange={handleContractChange}
          fullWidth
          disabled={!wallet || isContractChanging}
        >
          {/* Predefined contracts */}
          <MenuItem value={PREDEFINED_CONTRACTS.SIMPLE_VOTING}>
            Easy Private Voting
          </MenuItem>
          <MenuItem value={PREDEFINED_CONTRACTS.SIMPLE_TOKEN}>
            Simple Token
          </MenuItem>

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
          <CopyToClipboardButton
            disabled={!currentContractAddress}
            data={currentContractAddress?.toString()}
          />
        )}
      </FormControl>
      <AddSendersDialog open={openAddSendersDialog} onClose={handleSenderAdded} />
    </div>
  );
}
