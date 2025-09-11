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
import { AztecAddress, type DeployOptions, DeployMethod, TxStatus } from '@aztec/aztec.js';
import {
  formatFrAsString,
  parseAliasedBuffersAsString,
} from '../../../utils/conversion';
import { AztecContext } from '../../../aztecEnv';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { useTransaction } from '../../../hooks/useTransaction';
import { navbarButtonStyle, navbarSelect, navbarSelectLabel } from '../../../styles/common';
import SwitchAccountIcon from '@mui/icons-material/SwitchAccount';
import { trackButtonClick } from '../../../utils/matomo';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import type { EmbeddedWallet } from '../../../embedded_wallet';


export function AccountSelector() {
  const { setFrom, wallet, walletDB, isPXEInitialized, pxe, network, pendingTxUpdateCounter, from } = useContext(AztecContext);

  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);
  const [isAccountsLoading, setIsAccountsLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  const { sendTx } = useTransaction();

  const getAccounts = async () => {
    const aliasedBuffers = await walletDB.listAliases('accounts');
    const aliasedAccounts = parseAliasedBuffersAsString(aliasedBuffers);
    const testAccountData = network.hasTestAccounts ? await getInitialTestAccountsData() : [];
    let i = 0;
    for (const accountData of testAccountData) {
      const accountManager = await (wallet as EmbeddedWallet).createSchnorrAccount(
        accountData.secret,
        accountData.salt,
        accountData.signingKey,
      );
      if (!aliasedAccounts.find(({ value }) => accountManager.getAddress().equals(AztecAddress.fromString(value)))) {
        const instance = accountManager.getInstance();
        const account = await accountManager.getAccount();
        const alias = `test${i}`;
        await walletDB.storeAccount(instance.address, {
          type: 'schnorr',
          secretKey: account.getSecretKey(),
          alias,
          signingKey: deriveSigningKey(account.getSecretKey()),
          salt: instance.salt,
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
    const senders = await walletDB.listAliases('senders');
    const senderAddresses = parseAliasedBuffersAsString(senders).map(({ value }) => AztecAddress.fromString(value));
    for(const senderAddress of senderAddresses) {
      await wallet.registerSender(senderAddress);
    }
    setFrom(accountAddress);
    setIsAccountsLoading(false);
  };

  const handleAccountCreation = async (
    address?: AztecAddress,
    publiclyDeploy?: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) => {
    setOpenCreateAccountDialog(false);
    setIsAccountsLoading(true);
    if (address && publiclyDeploy) {
      const txReceipt = await sendTx(`Deploy Account`, interaction, address, opts);
      if (txReceipt?.status === TxStatus.SUCCESS) {
        setAccounts([
          ...accounts,
          { key: `accounts:${address}`, value: address.toString() },
        ]);
        setFrom(address);
      } else if (txReceipt?.status === TxStatus.DROPPED) {
        // Temporarily remove from accounts if deployment fails
        await walletDB.deleteAccount(address);
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
        {!from?.toString() && (
          <InputLabel id="account-label">Select Account</InputLabel>
        )}

        <Select
          fullWidth
          value={from?.toString() ?? ''}
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
        <CopyToClipboardButton disabled={!wallet} data={from?.toString()} />
      )}

      <CreateAccountDialog open={openCreateAccountDialog} onClose={handleAccountCreation} />
    </div>
  );
}
