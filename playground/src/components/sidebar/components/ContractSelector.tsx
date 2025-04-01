import { useState } from 'react';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import CodeIcon from '@mui/icons-material/Code';
import ContactsIcon from '@mui/icons-material/Contacts';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { CopyToClipboardButton } from '../../common/copyToClipboardButton';
import { select, nestedContainer, primaryButton } from '../styles';
import { formatFrAsString } from '../../../utils/conversion';
import { PREDEFINED_CONTRACTS } from '../types';
import type { AliasedItem } from '../types';
import { AztecAddress, AccountWalletWithSecretKey } from '@aztec/aztec.js';
import { setContract } from '../utils/contractHelpers';
import { AddSendersDialog } from './addSenderDialog';
import type { WalletDB } from '../../../utils/storage';

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

  const handleContractChange = (event: SelectChangeEvent) => {
    const contractValue = event.target.value;

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
    <div css={nestedContainer} style={{ opacity: wallet ? 1 : 0.5 }}>
      <Typography variant="overline" sx={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 600,
        fontSize: '17px',
        color: '#000000'
      }}>
        Contracts
      </Typography>
      <FormControl css={select}>
        <InputLabel>Contracts</InputLabel>
        <Select
          value={selectedPredefinedContract || currentContractAddress?.toString() || ''}
          label="Contract"
          onChange={handleContractChange}
          fullWidth
          disabled={!wallet}
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
        <CopyToClipboardButton
          disabled={!currentContractAddress}
          data={currentContractAddress?.toString()}
        />
      </FormControl>

      <div
        css={primaryButton}
        onClick={wallet ? handleShowContractInterface : undefined}
        style={{
          opacity: wallet ? 1 : 0.6,
          cursor: wallet ? 'pointer' : 'not-allowed'
        }}
      >
        Select Contract
      </div>

      <AddSendersDialog open={openAddSendersDialog} onClose={handleSenderAdded} />
    </div>
  );
}
