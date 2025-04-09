import { useState, useEffect, useContext } from 'react';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import CircularProgress from '@mui/material/CircularProgress';
import { CreateAccountDialog } from './CreateAccountDialog';
import { CopyToClipboardButton } from '../../common/CopyToClipboardButton';
import { AztecAddress, Fr, AccountWalletWithSecretKey } from '@aztec/aztec.js';
import { getSchnorrAccount } from '@aztec/accounts/schnorr/lazy';

import { select } from '../styles';
import { formatFrAsString, parseAliasedBuffersAsString } from '../../../utils/conversion';
import type { WalletDB } from '../../../utils/storage';
import type { AccountManager, PXE } from '@aztec/aztec.js';
import { css } from '@emotion/react';
import { AztecContext } from '../../../aztecEnv';
import type { ReactNode } from 'react';
import { LoadingModal } from '../../common/LoadingModal';
import { getInitialTestAccounts } from '@aztec/accounts/testing/lazy';
import { deriveSigningKey } from '@aztec/stdlib/keys';

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

interface AccountSelectorProps {}

export function AccountSelector({}: AccountSelectorProps) {
  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [isAccountChanging, setIsAccountChanging] = useState(false);
  const [deploymentInProgress, setDeploymentInProgress] = useState(false);
  const [accounts, setAccounts] = useState([]);

  const [isOpen, setIsOpen] = useState(false);

  const { setWallet, wallet, walletDB, isPXEInitialized, pxe } = useContext(AztecContext);

  const getAccounts = async () => {
    const aliasedBuffers = await walletDB.listAliases('accounts');
    const aliasedAccounts = parseAliasedBuffersAsString(aliasedBuffers);
    const testAccountData = await getInitialTestAccounts();
    let i = 0;
    for (const accountData of testAccountData) {
      const account: AccountManager = await getSchnorrAccount(
        pxe,
        accountData.secret,
        accountData.signingKey,
        accountData.salt,
      );
      if (!aliasedAccounts.find(({ value }) => account.getAddress().equals(AztecAddress.fromString(value)))) {
        await account.register();
        const instance = account.getInstance();
        const wallet = await account.getWallet();
        const alias = `test${i}`;
        await walletDB.storeAccount(instance.address, {
          type: 'schnorr',
          secretKey: wallet.getSecretKey(),
          alias,
          salt: account.getInstance().salt,
        });
        aliasedAccounts.push({
          key: `accounts:${alias}`,
          value: instance.address.toString(),
        });
      }
      i++;
    }
    return aliasedAccounts;
  };

  useEffect(() => {
    const refreshAccounts = async () => {
      const accounts = await getAccounts();
      setAccounts(accounts);
    };
    if (walletDB && walletDB && pxe) {
      refreshAccounts();
    }
  }, [wallet, walletDB, pxe]);

  const handleAccountChange = async (event: SelectChangeEvent) => {
    if (event.target.value == '') {
      return;
    }
    const accountAddress = AztecAddress.fromString(event.target.value);
    const accountData = await walletDB.retrieveAccount(accountAddress);
    const account = await getSchnorrAccount(
      pxe,
      accountData.secretKey,
      deriveSigningKey(accountData.secretKey),
      accountData.salt,
    );
    setWallet(await account.getWallet());
  };

  const handleAccountCreation = async (account?: AccountWalletWithSecretKey, salt?: Fr, alias?: string) => {
    if (account && salt && alias) {
      await walletDB.storeAccount(account.getAddress(), {
        type: 'schnorr',
        secretKey: account.getSecretKey(),
        alias,
        salt,
      });
      const aliasedAccounts = await walletDB.listAliases('accounts');
      setAccounts(parseAliasedBuffersAsString(aliasedAccounts));
      setWallet(account);
    }

    setOpenCreateAccountDialog(false);
  };

  // Set loading state based on accounts and connection state
  useEffect(() => {
    if (accounts.length === 0 && isPXEInitialized && pxe && walletDB) {
      setIsAccountsLoading(true);
    } else {
      setIsAccountsLoading(false);
    }
  }, [accounts, isPXEInitialized, pxe, walletDB]);

  // Render loading state if accounts are being loaded
  if (isAccountsLoading) {
    return (
      <div css={modalContainer}>
        <div css={loadingContainer}>
          <CircularProgress size={24} />
          <Typography variant="body2">{!isPXEInitialized ? 'Not connected...' : 'Loading accounts...'}</Typography>
        </div>
      </div>
    );
  }

  // If PXE is not initialized or network is not connected, show a message
  if (!isPXEInitialized) {
    return (
      <div css={loadingContainer}>
        <Typography variant="body2" color="warning.main">
          Note: Connect to a network first to create and use accounts
        </Typography>
      </div>
    );
  }

  return (
    <div css={modalContainer}>
      <FormControl css={select}>
        <InputLabel>Account</InputLabel>
        <Select
          fullWidth
          value={wallet?.getAddress().toString() ?? ''}
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
          <MenuItem
            key="create"
            value=""
            onClick={() => {
              setIsOpen(false);
              setOpenCreateAccountDialog(true);
            }}
          >
            <AddIcon />
            &nbsp;Create
          </MenuItem>
        </Select>
        {isAccountChanging && !currentTx?.error?.includes('cancelled') ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <CircularProgress size={20} />
          </div>
        ) : deploymentInProgress && !currentTx?.error?.includes('cancelled') ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '8px 0',
            }}
          >
            <CircularProgress size={20} />
            <Typography variant="caption" style={{ marginTop: '4px' }}>
              Deploying account with sponsored fees...
            </Typography>
          </div>
        ) : (
          <CopyToClipboardButton disabled={!wallet} data={wallet?.getAddress().toString()} />
        )}
      </FormControl>
      <CreateAccountDialog open={openCreateAccountDialog} onClose={handleAccountCreation} />
    </div>
  );
}
