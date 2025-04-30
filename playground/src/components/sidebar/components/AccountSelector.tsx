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
import { AztecAddress, type DeployOptions, AccountWalletWithSecretKey, DeployMethod } from '@aztec/aztec.js';
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
  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);

  const [isOpen, setIsOpen] = useState(false);

  const { setWallet, wallet, walletDB, isPXEInitialized, pxe, network } = useContext(AztecContext);

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
    const refreshAccounts = async () => {
      setIsAccountsLoading(true);
      const accounts = await getAccounts();
      setAccounts(accounts);
      setIsAccountsLoading(false);
    };
    if (walletDB && pxe) {
      refreshAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, walletDB, pxe]);

  // // If there is only one account, select it automatically
  // useEffect(() => {
  //   if (!isAccountsLoading && !wallet && accounts?.length === 1) {
  //     handleAccountChange(accounts[0].value);
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [accounts, wallet, isAccountsLoading]);

  const handleAccountChange = async (address: string) => {
    if (address == '') {
      return;
    }
    trackButtonClick(`Select Account ${address}`, 'Account Selector');
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
    setWallet(await accountManager.getWallet());
    setIsAccountsLoading(false);
  };

  const handleAccountCreation = async (
    accountWallet?: AccountWalletWithSecretKey,
    publiclyDeploy?: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) => {
    trackButtonClick('Create Account', 'Account Selector');
    setOpenCreateAccountDialog(false);
    setIsAccountsLoading(true);
    if (accountWallet && publiclyDeploy) {
      const deploymentResult = await sendTx(`Deploy Account`, interaction, accountWallet.getAddress(), opts);
      if (deploymentResult) {
        setAccounts([
          ...accounts,
          { key: `accounts:${accountWallet.getAddress()}`, value: accountWallet.getAddress().toString() },
        ]);
        setWallet(accountWallet);
      } else {
        // Temporarily remove from accounts if deployment fails
        await walletDB.deleteAccount(accountWallet.getAddress());
      }
    }
    setIsAccountsLoading(false);
  };

  return (
    <div css={navbarButtonStyle}>
      {isAccountsLoading ? (
        <CircularProgress size={24} />
      ) : (
        <SwitchAccountIcon />
      )}
      <FormControl css={navbarSelect}>
        {!wallet?.getAddress().toString() && (
          <InputLabel id="account-label">SelectAccount</InputLabel>
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
            if (isAccountsLoading) {
              return `Loading account...`;
            }
            if (selected) {
              const account = accounts.find(account => account.value === selected);
              if (account) {
                return `${account?.key.split(':')[1]} (${formatFrAsString(account?.value)})`
              }
            }
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
                setOpenCreateAccountDialog(true);
              }}
            >
              <AddIcon />
              &nbsp;Create
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
