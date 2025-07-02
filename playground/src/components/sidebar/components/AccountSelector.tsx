import { useState, useEffect, useContext } from 'react';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import CircularProgress from '@mui/material/CircularProgress';
import { CreateAccountDialog } from './CreateAccountDialog';
import { CopyToClipboardButton } from '../../common/CopyToClipboardButton';
import { AztecAddress, type DeployOptions, AccountWalletWithSecretKey, DeployMethod, TxStatus } from '@aztec/aztec.js';
import { getSchnorrAccount } from '@aztec/accounts/schnorr/lazy';
import {
  convertFromUTF8BufferAsString,
  formatFrAsString,
  parseAliasedBuffersAsString,
} from '../../../utils/conversion';
import { getEcdsaRAccount, getEcdsaKAccount } from '@aztec/accounts/ecdsa/lazy';
import { Fq, type AccountManager } from '@aztec/aztec.js';
import { AztecContext } from '../../../aztecEnv';
import { getInitialTestAccounts } from '@aztec/accounts/testing/lazy';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { useTransaction } from '../../../hooks/useTransaction';
import { navbarButtonStyle, navbarSelect, navbarSelectLabel } from '../../../styles/common';
import SwitchAccountIcon from '@mui/icons-material/SwitchAccount';
import { trackButtonClick } from '../../../utils/matomo';


export function AccountSelector() {
  const { setWallet, wallet, walletDB, isPXEInitialized, pxe, network, pendingTxUpdateCounter } = useContext(AztecContext);

  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);
  const [isAccountsLoading, setIsAccountsLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  const { sendTx } = useTransaction();

  const getAccounts = async () => {
    const aliasedBuffers = await walletDB.listAliases('accounts');
    const aliasedAccounts = parseAliasedBuffersAsString(aliasedBuffers);
    const testAccountData = network.hasTestAccounts ? await getInitialTestAccounts() : [];
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
    const refreshAccounts = async (showLoading = true) => {
      if (!walletDB || !pxe) {
        return;
      }

      if (showLoading) {
        setIsAccountsLoading(true);
      }
      const accounts = await getAccounts();
      setAccounts(accounts);
      if (showLoading) {
        setIsAccountsLoading(false);
      }
    };

    refreshAccounts();

    // Refresh accounts every 10 seconds, a new account may be created from other places
    const interval = setInterval(() => refreshAccounts(false), 10000);
    return () => clearInterval(interval);

    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [wallet, walletDB, pxe, pendingTxUpdateCounter]);

  // If there is only one account, select it automatically
  useEffect(() => {
    if (!isAccountsLoading && !wallet && accounts?.length === 1) {
      handleAccountChange(accounts[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, wallet, isAccountsLoading]);

  const handleAccountChange = async (address: string) => {
    if (address == '') {
      return;
    }
    trackButtonClick(`Select Account`, 'Account Selector');

    setIsAccountsLoading(true);
    const accountAddress = AztecAddress.fromString(address);
    const accountData = await walletDB.retrieveAccount(accountAddress);
    const type = convertFromUTF8BufferAsString(accountData.type);
    let accountManager: AccountManager;
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
    await accountManager.register();
    const senders = await walletDB.listAliases('senders');
    const senderAddresses = parseAliasedBuffersAsString(senders).map(({ value }) => AztecAddress.fromString(value));
    const wallet = await accountManager.getWallet();
    for(const senderAddress of senderAddresses) {
      await wallet.registerSender(senderAddress);
    }
    setWallet(wallet);
    setIsAccountsLoading(false);
  };

  const handleAccountCreation = async (
    accountWallet?: AccountWalletWithSecretKey,
    publiclyDeploy?: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) => {
    setOpenCreateAccountDialog(false);
    setIsAccountsLoading(true);
    if (accountWallet && publiclyDeploy) {
      const txReceipt = await sendTx(`Deploy Account`, interaction, accountWallet.getAddress(), opts);
      if (txReceipt?.status === TxStatus.SUCCESS) {
        setAccounts([
          ...accounts,
          { key: `accounts:${accountWallet.getAddress()}`, value: accountWallet.getAddress().toString() },
        ]);
        setWallet(accountWallet);
      } else if (txReceipt?.status === TxStatus.DROPPED) {
        // Temporarily remove from accounts if deployment fails
        await walletDB.deleteAccount(accountWallet.getAddress());
      }
    }
    setIsAccountsLoading(false);
  };

  if (isAccountsLoading) {
    return (
      <div css={navbarButtonStyle}>
        <CircularProgress size={24} color="primary" sx={{ marginRight: '1rem' }} />
        <Typography variant="body1">Loading account...</Typography>
      </div>
    );
  }

  return (
    <div css={navbarButtonStyle}>
      <SwitchAccountIcon />

      <FormControl css={navbarSelect}>
        {!wallet?.getAddress().toString() && (
          <InputLabel id="account-label">Select Account</InputLabel>
        )}

        <Select
          fullWidth
          value={wallet?.getAddress().toString() ?? ''}
          label="Account"
          open={isOpen}
          onOpen={() => setIsOpen(true)}
          onClose={() => setIsOpen(false)}
          onChange={(e) => handleAccountChange(e.target.value)}
          disabled={isAccountsLoading}
          renderValue={selected => {
            const account = accounts.find(account => account.value === selected);
            if (account) {
              return `${account?.key.split(':')[1]} (${formatFrAsString(account?.value)})`
            }
            return selected ?? 'Select Account';
          }}
        >
          {!isPXEInitialized && (
            <div css={navbarSelectLabel}>
              <Typography variant="body2" color="warning.main">
                Note: Connect to a network first to create and use accounts
              </Typography>
            </div>
          )}

          {isPXEInitialized && accounts.map(account => (
            <MenuItem key={account.key} value={account.value}>
              {account.key.split(':')[1]}&nbsp;(
              {formatFrAsString(account.value)})
            </MenuItem>
          ))}

          {isPXEInitialized && (
            <MenuItem
              key="create"
              value=""
              onClick={() => {
                setIsOpen(false);
                trackButtonClick('Create Account', 'Account Selector');
                setOpenCreateAccountDialog(true);
              }}
            >
              <AddIcon sx={{ marginRight: '0.5rem' }} />
              Create
            </MenuItem>
          )}

        </Select>
      </FormControl>

      {!isAccountsLoading && wallet && (
        <CopyToClipboardButton disabled={!wallet} data={wallet?.getAddress().toString()} />
      )}

      <CreateAccountDialog open={openCreateAccountDialog} onClose={handleAccountCreation} />
    </div>
  );
}
