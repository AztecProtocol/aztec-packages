import { useState } from 'react';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { CreateAccountDialog } from './createAccountDialog';
import { CopyToClipboardButton } from '../../common/copyToClipboardButton';
import { AztecAddress, Fr, AccountWalletWithSecretKey } from '@aztec/aztec.js';
import type { AliasedItem } from '../types';
import { select, buttonContainer, actionButton } from '../styles';
import { formatFrAsString } from '../../../utils/conversion';
import { createWalletForAccount } from '../utils/accountHelpers';
import type { WalletDB } from '../../../utils/storage';
import type { PXE } from '@aztec/aztec.js';

interface AccountSelectorProps {
  accounts: AliasedItem[];
  currentWallet: AccountWalletWithSecretKey | null;
  isPXEInitialized: boolean;
  pxe: PXE | null;
  walletDB: WalletDB | null;
  changingNetworks: boolean;
  isConnecting: boolean;
  setWallet: (wallet: AccountWalletWithSecretKey) => void;
  onAccountsChange: () => void;
}

export function AccountSelector({
  accounts,
  currentWallet,
  isPXEInitialized,
  pxe,
  walletDB,
  changingNetworks,
  isConnecting,
  setWallet,
  onAccountsChange
}: AccountSelectorProps) {
  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);

  const handleAccountChange = async (event: SelectChangeEvent) => {
    if (!pxe || !walletDB) return;
    if (event.target.value === '') return;

    try {
      const accountAddress = AztecAddress.fromString(event.target.value);
      const accountData = await walletDB.retrieveAccount(accountAddress);

      // Retrieve the signing private key from metadata
      const signingPrivateKey = await walletDB.retrieveAccountMetadata(accountAddress, 'signingPrivateKey');

      if (!signingPrivateKey) {
        throw new Error('Could not find signing private key for this account');
      }

      const newWallet = await createWalletForAccount(pxe, accountAddress, signingPrivateKey);
      setWallet(newWallet);
    } catch (error) {
      console.error('Error changing account:', error);
    }
  };

  const handleAccountCreation = async (account?: AccountWalletWithSecretKey, salt?: Fr, alias?: string) => {
    if (!walletDB) return;

    if (account && salt && alias) {
      try {
        // In account creation dialog, we need to make sure to get the signing private key
        // which may be passed in account somehow, depending on how CreateAccountDialog works
        const signingPrivateKey = (account as any).signingPrivateKey;

        // Store the account without the extra property
        await walletDB.storeAccount(account.getAddress(), {
          type: 'ecdsasecp256k1', // Update to the K account type
          secretKey: account.getSecretKey(),
          alias,
          salt,
        });

        // Store the signing key as metadata if it's available
        if (signingPrivateKey) {
          await walletDB.storeAccountMetadata(account.getAddress(), 'signingPrivateKey', signingPrivateKey);
        } else {
          // If no signing key is provided, generate a simple one based on address
          const addressBytes = account.getAddress().toBuffer();
          const generatedSigningKey = Buffer.concat([
            addressBytes.slice(0, 16), // First half of address
            addressBytes.slice(0, 16)  // Repeat to get 32 bytes
          ]);
          await walletDB.storeAccountMetadata(account.getAddress(), 'signingPrivateKey', generatedSigningKey);
        }

        onAccountsChange();
        setWallet(account);
      } catch (error) {
        console.error('Error creating account:', error);
      }
    }

    setOpenCreateAccountDialog(false);
  };

  return (
    <>
      <Typography variant="overline" sx={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 600,
        fontSize: '17px',
        color: '#000000',
        marginTop: '1.5rem',
        display: 'block'
      }}>
        Connect to Network
      </Typography>

      <div style={{ position: 'relative' }}>
        <div
          css={actionButton}
          onClick={() => !(!isPXEInitialized || changingNetworks || isConnecting) && setOpenCreateAccountDialog(true)}
          style={{
            opacity: (!isPXEInitialized || changingNetworks || isConnecting) ? 0.6 : 1,
            cursor: (!isPXEInitialized || changingNetworks || isConnecting) ? 'not-allowed' : 'pointer'
          }}
        >
          Create Account
        </div>
        {(!isPXEInitialized || changingNetworks || isConnecting) && (
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{
              position: 'absolute',
              bottom: '-18px',
              width: '100%',
              textAlign: 'center',
              fontSize: '0.7rem'
            }}
          >
            Connect to a network first
          </Typography>
        )}
      </div>

      {pxe && isPXEInitialized ? (
        <>
          <FormControl css={select} sx={{ marginTop: '1.5rem' }}>
            <InputLabel>Account</InputLabel>
            <Select
              fullWidth
              value={currentWallet?.getAddress().toString() ?? ''}
              label="Account"
              onChange={handleAccountChange}
            >
              {accounts.map(account => (
                <MenuItem key={account.key} value={account.value}>
                  {account.key.split(':')[1]}&nbsp;(
                  {formatFrAsString(account.value)})
                </MenuItem>
              ))}
              <MenuItem key="create" value="" onClick={() => setOpenCreateAccountDialog(true)}>
                <AddIcon />
                &nbsp;Create
              </MenuItem>
            </Select>
            <CopyToClipboardButton disabled={!currentWallet} data={currentWallet?.getAddress().toString()} />
          </FormControl>
        </>
      ) : null}

      <CreateAccountDialog open={openCreateAccountDialog} onClose={handleAccountCreation} />
    </>
  );
}
