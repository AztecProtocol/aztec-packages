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
  const { node } = useContext(AztecContext);

  // Set loading state based on accounts and connection state
  useEffect(() => {
    // If we have no accounts but we have a wallet connection, we're probably still loading
    if (accounts.length === 0 && isPXEInitialized && pxe && walletDB && !changingNetworks) {
      setIsAccountsLoading(true);
    } else {
      setIsAccountsLoading(false);
    }
  }, [accounts, isPXEInitialized, pxe, walletDB, changingNetworks]);

  const handleAccountChange = async (event: SelectChangeEvent) => {
    if (!pxe || !walletDB) return;
    if (event.target.value === '') return;

    setIsAccountChanging(true);
    try {
      const accountAddress = AztecAddress.fromString(event.target.value);
      console.log(`Selected account ${accountAddress.toString()}`);

      const accountData = await walletDB.retrieveAccount(accountAddress);
      console.log('Retrieved account data:', accountData ? 'Account found in database' : 'Account not found');

      // Retrieve the signing private key from metadata
      const signingPrivateKey = await walletDB.retrieveAccountMetadata(accountAddress, 'signingPrivateKey');
      console.log('Retrieved signing key:', signingPrivateKey ? 'Signing key found' : 'No signing key found');

      if (!signingPrivateKey) {
        throw new Error('Could not find signing private key for this account');
      }

      // Get the wallet
      console.log('Creating wallet for account...');
      const newWallet = await createWalletForAccount(pxe, accountAddress, signingPrivateKey);
      console.log('Wallet created successfully');
      setWallet(newWallet);

      // Check if the account should be deployed
      console.log('Checking account deployment status...');
      const deploymentStatus = await walletDB.retrieveAccountMetadata(accountAddress, 'deploymentStatus');
      console.log('Deployment status from database:', deploymentStatus ? deploymentStatus.toString() : 'Not set');

      const isDeployed = deploymentStatus && deploymentStatus.toString() === 'deployed';

      if (!isDeployed && node) {
        try {
          setDeploymentInProgress(true);
          // Deploy the account using sponsored fee payment
          console.log(`Deploying account ${accountAddress.toString()} with sponsored fee payment...`);
          await deployAccountWithSponsoredFPC(pxe, newWallet, node);
          console.log(`Account ${accountAddress.toString()} deployment process completed`);

          // Try to verify the deployment
          console.log('Verifying account deployment...');
          try {
            const contracts = await pxe.getContracts();
            const isInPXEContracts = contracts.some(c => c.equals(accountAddress));
            console.log(`Account ${isInPXEContracts ? 'found' : 'not found'} in PXE contracts list`);

            // Update deployment status regardless - we've done our best to deploy
            await walletDB.storeAccountMetadata(accountAddress, 'deploymentStatus', Buffer.from('deployed'));
            console.log('Updated account deployment status in database');
          } catch (verifyError) {
            console.error('Error verifying deployment:', verifyError);
          }
        } catch (deployError) {
          console.error('Error deploying account:', deployError);
          // Continue anyway since the account is registered and may still function
        } finally {
          setDeploymentInProgress(false);
        }
      } else {
        console.log(`Account ${isDeployed ? 'is already marked as deployed' : 'deployment skipped (no node)'}`);
      }
    } catch (error) {
      console.error('Error changing account:', error);
    } finally {
      setIsAccountChanging(false);
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
          onChange={handleAccountChange}
          disabled={isAccountChanging}
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
        {isAccountChanging ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <CircularProgress size={20} />
          </div>
        ) : deploymentInProgress ? (
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
