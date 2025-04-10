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
import { AztecAddress, type DeployOptions, AccountWalletWithSecretKey, DeployMethod } from '@aztec/aztec.js';
import { getSchnorrAccount } from '@aztec/accounts/schnorr/lazy';

import {
  convertFromUTF8BufferAsString,
  formatFrAsString,
  parseAliasedBuffersAsString,
} from '../../../utils/conversion';
import { getEcdsaRAccount, getEcdsaKAccount } from '@aztec/accounts/ecdsa/lazy';

import { Fq, type AccountManager } from '@aztec/aztec.js';
import { css } from '@emotion/react';
import { AztecContext } from '../../../aztecEnv';
import { getInitialTestAccounts } from '@aztec/accounts/testing/lazy';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { useTransaction } from '../../../hooks/useTransaction';
import { select } from '../../../styles/common';

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

export function AccountSelector() {
  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [isAccountChanging, setIsAccountChanging] = useState(false);
  const [deploymentInProgress, setDeploymentInProgress] = useState(false);
  const [accounts, setAccounts] = useState([]);

  const [isOpen, setIsOpen] = useState(false);

  const { setWallet, wallet, walletDB, isPXEInitialized, pxe } = useContext(AztecContext);

  const { sendTx } = useTransaction();

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
          signingKey: deriveSigningKey(wallet.getSecretKey()),
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
    const type = convertFromUTF8BufferAsString(accountData.type);
    let accountManager;
    switch (type) {
      case 'schnorr': {
        accountManager = await getSchnorrAccount(
          pxe,
          accountData.secretKey,
          Fq.fromBuffer(accountData.signingKey),
          accountData.salt,
        );
        break;
      }
      case 'ecdsasecp256r1': {
        accountManager = await getEcdsaRAccount(pxe, accountData.secretKey, accountData.signingKey, accountData.salt);
        break;
      }
      case 'ecdsasecp256k1': {
        accountManager = await getEcdsaKAccount(pxe, accountData.secretKey, accountData.signingKey, accountData.salt);
        break;
      }
      default: {
        throw new Error('Unknown account type');
      }
    }
    setWallet(await accountManager.getWallet());
  };

  const handleAccountCreation = async (
    accountWallet?: AccountWalletWithSecretKey,
    publiclyDeploy?: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) => {
    setOpenCreateAccountDialog(false);
    if (accountWallet) {
      setIsAccountChanging(true);
      const aliasedAccounts = await walletDB.listAliases('accounts');
      setAccounts(parseAliasedBuffersAsString(aliasedAccounts));
      setWallet(accountWallet);
      if (publiclyDeploy) {
        setDeploymentInProgress(true);
        await sendTx(`Deployment of account`, interaction, accountWallet.getAddress(), opts);
        setDeploymentInProgress(false);
      }
    }
    setIsAccountChanging(false);
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
          disabled={isAccountChanging}
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
        {wallet && !isAccountChanging && !deploymentInProgress && (
          <CopyToClipboardButton disabled={!wallet} data={wallet?.getAddress().toString()} />
        )}
      </FormControl>
      <CreateAccountDialog open={openCreateAccountDialog} onClose={handleAccountCreation} />
    </div>
  );
}
