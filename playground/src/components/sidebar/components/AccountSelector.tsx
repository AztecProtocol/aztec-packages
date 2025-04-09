import { useState, useEffect, useContext } from 'react';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import CircularProgress from '@mui/material/CircularProgress';
import { CreateAccountDialog } from './createAccountDialog';
import { CopyToClipboardButton } from '../../common/copyToClipboardButton';
import { AztecAddress, Fr, AccountWalletWithSecretKey } from '@aztec/aztec.js';
import type { AliasedItem } from '../types';
import { select, actionButton } from '../styles';
import { formatFrAsString } from '../../../utils/conversion';
import { createWalletForAccount, deployAccountWithSponsoredFPC } from '../utils/accountHelpers';
import type { WalletDB } from '../../../utils/storage';
import type { PXE } from '@aztec/aztec.js';
import { css } from '@emotion/react';
import { AztecContext } from '../../../aztecEnv';
import type { ReactNode } from 'react';
import { LoadingModal } from '../../common/LoadingModal';

const modalContainer = css({
  padding: '10px 0',
});

const createButtonContainer = css({
  marginTop: '15px',
  marginBottom: '15px',
});

const loadingContainer = css({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexDirection: 'column',
  padding: '20px 0',
  gap: '12px',
});

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
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [isAccountChanging, setIsAccountChanging] = useState(false);
  const [deploymentInProgress, setDeploymentInProgress] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { node, currentTx, setCurrentTx, setIsWorking } = useContext(AztecContext);

  // Set loading state based on accounts and connection state
  useEffect(() => {
    // If we have no accounts but we have a wallet connection, we're probably still loading
    if (accounts.length === 0 && isPXEInitialized && pxe && walletDB && !changingNetworks) {
      setIsAccountsLoading(true);
    } else {
      setIsAccountsLoading(false);
    }
  }, [accounts, isPXEInitialized, pxe, walletDB, changingNetworks]);

  const handleAccountChange = async (event: SelectChangeEvent<`0x${string}`>, child: ReactNode) => {
    if (!pxe || !walletDB) {
      console.error('PXE or walletDB not available');
      return;
    }

    const selectedAccountStr = event.target.value;
    if (!selectedAccountStr) {
      return;
    }

    const selectedAccount = AztecAddress.fromString(selectedAccountStr);
    setIsAccountChanging(true);
    setDeploymentInProgress(true);

    try {
      // Get account data from walletDB
      const accountData = await walletDB.retrieveAccount(selectedAccount);
      if (!accountData) {
        throw new Error(`No account data found for ${selectedAccount.toString()}`);
      }

      // Get signing private key
      const signingPrivateKey = await walletDB.retrieveAccountMetadata(selectedAccount, 'signingPrivateKey');
      if (!signingPrivateKey) {
        throw new Error(`No signing private key found for ${selectedAccount.toString()}`);
      }

      // Create wallet for the account
      const wallet = await createWalletForAccount(pxe, selectedAccount, signingPrivateKey);

      // Check if account is deployed
      try {
        const metadata = await pxe.getContractMetadata(selectedAccount);
        if (!metadata.isContractPubliclyDeployed) {
          // Set up the deployment modal
          setCurrentTx({
            status: 'proving' as const,
            fnName: 'deploy',
            contractAddress: selectedAccount,
          });
          setIsWorking(true);

          // Attempt to deploy the account
          await deployAccountWithSponsoredFPC(pxe, wallet, null, walletDB);

          // Update deployment status
          setCurrentTx({
            status: 'sending' as const,
            fnName: 'deploy',
            contractAddress: selectedAccount,
          });
        }
      } catch (error) {
        // Only throw if it's not a cancellation error
        if (error.message !== 'Deployment cancelled by user') {
          console.error('Error checking deployment status:', error);
          setCurrentTx({
            status: 'error' as const,
            fnName: 'deploy',
            contractAddress: selectedAccount,
            error: error.message || 'Failed to deploy account',
          });
          throw error;
        }
      }

      // Update the selected wallet regardless of deployment status
      setWallet(wallet);
      onAccountsChange();
    } catch (error) {
      // Only show error if it's not a cancellation
      if (error.message !== 'Deployment cancelled by user') {
        console.error('Error changing account:', error);
        setCurrentTx({
          status: 'error' as const,
          fnName: 'deploy',
          contractAddress: selectedAccount,
          error: error.message || 'Failed to change account',
        });
      }
    } finally {
      // Only clear deployment state if it's not a cancellation
      if (!currentTx || currentTx.error !== 'Deployment cancelled by user') {
        setIsAccountChanging(false);
        setDeploymentInProgress(false);
      }
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

  // Render loading state if accounts are being loaded
  if (isAccountsLoading || isConnecting || changingNetworks) {
    return (
      <div css={modalContainer}>
        <div css={loadingContainer}>
          <CircularProgress size={24} />
          <Typography variant="body2">
            {changingNetworks ? 'Network is changing...' : 'Loading accounts...'}
          </Typography>
        </div>
      </div>
    );
  }

  // If PXE is not initialized or network is not connected, show a message
  if (!isPXEInitialized || !pxe) {
    return (
      <div css={modalContainer}>
        <FormControl css={select}>
          <InputLabel>Account</InputLabel>
          <Select
            fullWidth
            value=""
            label="Account"
            onChange={(e) => {
              // If "Create" is selected, open the create account dialog
              if (e.target.value === 'create') {
                setOpenCreateAccountDialog(true);
              }
            }}
          >
            <MenuItem key="create" value="create">
              <AddIcon />
              &nbsp;Create
            </MenuItem>
          </Select>
        </FormControl>
        <div css={loadingContainer}>
          <Typography variant="body2" color="warning.main">
            Note: Connect to a network first to create and use accounts
          </Typography>
        </div>
        <CreateAccountDialog
          open={openCreateAccountDialog}
          onClose={() => setOpenCreateAccountDialog(false)}
          networkDisconnected={true}
        />
      </div>
    );
  }

  return (
    <div css={modalContainer}>
      <FormControl css={select}>
        <InputLabel>Account</InputLabel>
        <Select
          fullWidth
          value={currentWallet?.getAddress().toString() ?? ''}
          label="Account"
          open={isOpen}
          onOpen={() => setIsOpen(true)}
          onClose={() => setIsOpen(false)}
          onChange={handleAccountChange}
          disabled={isAccountChanging && !currentTx?.error?.includes('cancelled')}
        >
          {accounts.map(account => (
            <MenuItem key={account.key} value={account.value}>
              {account.key.split(':')[1]}&nbsp;(
              {formatFrAsString(account.value)})
            </MenuItem>
          ))}
          <MenuItem key="create" value="" onClick={() => {
            setIsOpen(false);
            setOpenCreateAccountDialog(true);
          }}>
            <AddIcon />
            &nbsp;Create
          </MenuItem>
        </Select>
        {isAccountChanging && !currentTx?.error?.includes('cancelled') ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <CircularProgress size={20} />
          </div>
        ) : deploymentInProgress && !currentTx?.error?.includes('cancelled') ? (
          <div style={{ display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center', padding: '8px 0' }}>
            <CircularProgress size={20} />
            <Typography variant="caption" style={{ marginTop: '4px' }}>
              Deploying account with sponsored fees...
            </Typography>
          </div>
        ) : (
          <CopyToClipboardButton disabled={!currentWallet} data={currentWallet?.getAddress().toString()} />
        )}
      </FormControl>
      <CreateAccountDialog open={openCreateAccountDialog} onClose={handleAccountCreation} />
    </div>
  );
}
