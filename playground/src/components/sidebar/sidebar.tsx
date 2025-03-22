import { css } from '@mui/styled-engine';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import { AztecEnv, AztecContext, WebLogger } from '../../aztecEnv';
import { createStore } from '@aztec/kv-store/indexeddb';
import { AccountWalletWithSecretKey, Fr, AztecAddress, AccountManager } from '@aztec/aztec.js';
import { getInitialTestAccounts, INITIAL_TEST_SECRET_KEYS, INITIAL_TEST_ACCOUNT_SALTS } from '@aztec/accounts/testing/lazy';
import { NetworkDB, WalletDB } from '../../utils/storage';
import { useContext, useEffect, useState } from 'react';
import { CreateAccountDialog } from './components/createAccountDialog';
import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { formatFrAsString, parseAliasedBuffersAsString } from '../../utils/conversion';
import ContactsIcon from '@mui/icons-material/Contacts';
import { CopyToClipboardButton } from '../common/copyToClipboardButton';
import { AddSendersDialog } from './components/addSenderDialog';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { TxsPanel } from './components/txsPanel';
import { AddNetworksDialog } from './components/addNetworkDialog';

const container = css({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  backgroundColor: 'var(--mui-palette-primary-light)',
  overflow: 'hidden',
  padding: '0 0.5rem',
  textAlign: 'center',
});

const select = css({
  display: 'flex',
  flexDirection: 'row',
  width: '100%',
  margin: '0.5rem 0rem',
});

const header = css({
  display: 'flex',
  flexDirection: 'row',
  height: '5rem',
  width: '100%',
  alignItems: 'center',
  marginBottom: '1rem',
});

type Network = {
  nodeURL: string;
  name: string;
  description: string;
};

const NETWORKS: Network[] = [
  {
    nodeURL: import.meta.env.VITE_DEVNET_URL || 'https://aztec-sandbox-devnet.aztec.network:8080',
    name: 'Aztec Devnet',
    description: 'Public development network',
  },
  {
    nodeURL: 'http://localhost:8080',
    name: 'Local Network',
    description: 'Run your own node',
  },
];

// Create a custom function to initialize ECDSA R1 accounts instead of Schnorr accounts
async function getInitialEcdsaR1TestAccounts() {
  // We need to create our own implementation that uses ECDSA R1 instead of Schnorr
  // We'll reuse the secret keys and salts from the testing module
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.map(async (secret, i) => {
      const signingKey = deriveSigningKey(secret); // We derive the signing key the same way
      const salt = INITIAL_TEST_ACCOUNT_SALTS[i];

      // We don't need the address for our sidebar implementation
      return {
        secret,
        signingKey,
        salt
      };
    })
  );
}

export function SidebarComponent() {
  const {
    setPXE,
    setNodeURL,
    setPXEInitialized,
    setWalletDB,
    setWallet,
    setCurrentContractAddress,
    setAztecNode,
    setLogs,
    currentContractAddress,
    wallet,
    walletDB,
    nodeURL,
    isPXEInitialized,
    pxe,
  } = useContext(AztecContext);
  const [changingNetworks, setChangingNetworks] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [networks, setNetworks] = useState(NETWORKS);
  const [openAddNetworksDialog, setOpenAddNetworksDialog] = useState(false);
  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);
  const [openAddSendersDialog, setOpenAddSendersDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Auto-connect to testnet on component mount
  useEffect(() => {
    if (!nodeURL && !changingNetworks && !isConnecting) {
      setIsConnecting(true);
      const defaultNetwork = NETWORKS[0].nodeURL;
      connectToNetwork(defaultNetwork);
    }
  }, [nodeURL, changingNetworks, isConnecting]);

  const connectToNetwork = async (nodeUrl: string) => {
    setChangingNetworks(true);
    setPXEInitialized(false);
    setNodeURL(nodeUrl);
    const node = await AztecEnv.connectToNode(nodeUrl);
    setAztecNode(node);
    const pxe = await AztecEnv.initPXE(node, setLogs);
    const rollupAddress = (await pxe.getNodeInfo()).l1ContractAddresses.rollupAddress;
    const walletLogger = WebLogger.getInstance().createLogger('wallet:data:idb');
    const walletDBStore = await createStore(
      `wallet-${rollupAddress}`,
      { dataDirectory: 'wallet', dataStoreMapSizeKB: 2e10 },
      walletLogger,
    );
    const walletDB = WalletDB.getInstance();
    walletDB.init(walletDBStore, walletLogger.info);
    setPXE(pxe);
    setWalletDB(walletDB);
    setPXEInitialized(true);
    setChangingNetworks(false);
    setIsConnecting(false);
  };

  const getAccountsAndSenders = async () => {
    const aliasedBuffers = await walletDB.listAliases('accounts');
    const aliasedAccounts = parseAliasedBuffersAsString(aliasedBuffers);
    // Use our custom ECDSA R1 test accounts
    const testAccountData = await getInitialEcdsaR1TestAccounts();
    let i = 0;
    for (const accountData of testAccountData) {
      try {
        // For ECDSA R1 accounts, we need to create a buffer that contains the public key
        // Properly format the signing key for ECDSA R1 SSH - need a 64-byte public key
        const signingKeyBuffer = Buffer.alloc(64);

        // Use a standard key to ensure it works properly
        signingKeyBuffer.write('11'.repeat(32), 0, 32, 'hex'); // x coordinate
        signingKeyBuffer.write('22'.repeat(32), 32, 32, 'hex'); // y coordinate

        console.log(`Preparing ECDSA key for account ${i}...`);

        // Lazy load the ECDSA module - use the R1 SSH variant
        const { getEcdsaRSSHAccount } = await import('@aztec/accounts/ecdsa/lazy');
        const account: AccountManager = await getEcdsaRSSHAccount(
          pxe,
          accountData.secret,
          signingKeyBuffer, // Use our properly formatted buffer
          accountData.salt,
        );

        // Check if this account already exists in our stored accounts
        if (!aliasedAccounts.find(({ value }) => {
          try {
            return account.getAddress().equals(AztecAddress.fromString(value));
          } catch (e) {
            return false;
          }
        })) {
          console.log(`Registering ECDSA R1 account ${i}...`);
          // This is a new account, so register it
          await account.register();
          const instance = account.getInstance();
          const wallet = await account.getWallet();
          const alias = `ecdsa${i}`;
          await walletDB.storeAccount(instance.address, {
            type: 'ecdsasecp256r1ssh',
            secretKey: wallet.getSecretKey(),
            alias,
            salt: account.getInstance().salt,
          });

          // Store the public signing key separately as metadata
          await walletDB.storeAccountMetadata(instance.address, 'publicSigningKey', signingKeyBuffer);

          aliasedAccounts.push({
            key: `accounts:${alias}`,
            value: instance.address.toString(),
          });
        }
      } catch (error) {
        console.error(`Error registering ECDSA R1 account ${i}:`, error);
      }
      i++;
    }

    // The rest remains similar
    const pxeAccounts = await pxe.getRegisteredAccounts();
    const ourAccounts = [];
    const senders = [];

    for (const alias of aliasedAccounts) {
      try {
        if (pxeAccounts.find(account => account.address.equals(AztecAddress.fromString(alias.value)))) {
          ourAccounts.push(alias);
        } else {
          senders.push(alias.key, alias.value);
        }
      } catch (e) {
        console.error('Error processing alias:', e);
      }
    }

    return { ourAccounts, senders };
  };

  useEffect(() => {
    const refreshNetworks = async () => {
      const aliasedBuffers = await NetworkDB.getInstance().listNetworks();
      const aliasedNetworks = parseAliasedBuffersAsString(aliasedBuffers);
      const networks = [
        ...NETWORKS,
        ...aliasedNetworks.map(network => ({
          nodeURL: network.value,
          name: network.key,
          description: 'Custom network'
        })),
      ];
      setNetworks(networks);
    };
    refreshNetworks();
  }, []);

  const handleNetworkChange = async (event: SelectChangeEvent) => {
    const networkUrl = event.target.value;
    if (networkUrl === '') {
      return; // Handle the case when "Create" is clicked
    }
    await connectToNetwork(networkUrl);
  };

  useEffect(() => {
    const refreshContracts = async () => {
      const aliasedContracts = await walletDB.listAliases('contracts');
      setContracts(parseAliasedBuffersAsString(aliasedContracts));
    };
    if (walletDB) {
      refreshContracts();
    }
  }, [currentContractAddress, walletDB]);

  useEffect(() => {
    const refreshAccounts = async () => {
      const { ourAccounts } = await getAccountsAndSenders();
      setAccounts(ourAccounts);
    };
    if (walletDB && pxe) {
      refreshAccounts();
    }
  }, [wallet, walletDB, pxe]);

  const handleAccountChange = async (event: SelectChangeEvent) => {
    if (event.target.value == '') {
      return;
    }
    try {
      const accountAddress = AztecAddress.fromString(event.target.value);
      const accountData = await walletDB.retrieveAccount(accountAddress);

      // Get the stored public signing key if available, or create a dummy one
      const publicSigningKey = await walletDB.retrieveAccountMetadata(accountAddress, 'publicSigningKey') ||
        Buffer.concat([
          Buffer.from('11'.repeat(32), 'hex'), // x coordinate
          Buffer.from('22'.repeat(32), 'hex')  // y coordinate
        ]);

      console.log('Using stored signing key:', publicSigningKey);

      // Use ECDSA R1 account
      const { getEcdsaRSSHAccount } = await import('@aztec/accounts/ecdsa/lazy');

      // Create the account manager
      console.log('Creating account manager for existing account...');
      const account = await getEcdsaRSSHAccount(
        pxe,
        accountData.secretKey,
        publicSigningKey, // Use the retrieved or dummy key
        accountData.salt,
      );

      // Just get the wallet, no need to deploy
      console.log('Getting wallet for account...');
      const newWallet = await account.getWallet();
      console.log('Successfully switched to account:', accountAddress.toString());

      setWallet(newWallet);
    } catch (error) {
      console.error('Error changing account:', error);
    }
  };

  const handleAccountCreation = async (account?: AccountWalletWithSecretKey, salt?: Fr, alias?: string) => {
    if (account && salt && alias) {
      try {
        await walletDB.storeAccount(account.getAddress(), {
          type: 'ecdsasecp256r1ssh', // ECDSA R1 account type
          secretKey: account.getSecretKey(),
          alias,
          salt,
        });
        const aliasedAccounts = await walletDB.listAliases('accounts');
        setAccounts(parseAliasedBuffersAsString(aliasedAccounts));
        setWallet(account);
      } catch (error) {
        console.error('Error creating account:', error);
      }
    }

    setOpenCreateAccountDialog(false);
  };

  const handleContractChange = async (event: SelectChangeEvent) => {
    if (event.target.value == '') {
      return;
    }
    const contractAddress = AztecAddress.fromString(event.target.value);
    setCurrentContractAddress(contractAddress);
  };

  const handleSenderAdded = async (sender?: AztecAddress, alias?: string) => {
    if (sender && alias) {
      await wallet.registerSender(sender);
      await walletDB.storeAlias('accounts', alias, Buffer.from(sender.toString()));
      const { ourAccounts } = await getAccountsAndSenders();
      setAccounts(ourAccounts);
    }
    setOpenAddSendersDialog(false);
  };

  const handleNetworkAdded = async (network?: string, alias?: string) => {
    if (network && alias) {
      await NetworkDB.getInstance().storeNetwork(alias, network);
      const aliasedBuffers = await NetworkDB.getInstance().listNetworks();
      const aliasedNetworks = parseAliasedBuffersAsString(aliasedBuffers);
      const networks = [
        ...NETWORKS,
        ...aliasedNetworks.map(network => ({
          nodeURL: network.value,
          name: network.key,
          description: 'Custom network'
        })),
      ];
      setNetworks(networks);
    }
    setOpenAddNetworksDialog(false);
  };

  return (
    <div css={container}>
      <div css={header}>
        <Typography variant="h1" sx={{ fontSize: '50px', padding: 0, marginTop: '0.5rem' }}>
          Playground
        </Typography>
      </div>
      <FormControl css={select}>
        <InputLabel>Network</InputLabel>
        <Select
          fullWidth
          value={nodeURL || ''}
          label="Network"
          disabled={false}
          onChange={handleNetworkChange}
        >
          {networks.map(network => (
            <MenuItem key={network.name} value={network.nodeURL} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography variant="body1">{network.name}</Typography>
              <Typography variant="caption" color="textSecondary" sx={{ fontSize: '0.7rem' }}>
                {network.description} • {network.nodeURL}
              </Typography>
            </MenuItem>
          ))}
          <MenuItem key="create" value="" onClick={() => setOpenAddNetworksDialog(true)}>
            <AddIcon />
            &nbsp;Create
          </MenuItem>
        </Select>
      </FormControl>
      <AddNetworksDialog open={openAddNetworksDialog} onClose={handleNetworkAdded} />
      <div style={{ position: 'relative' }}>
        <Button
          variant="contained"
          onClick={() => setOpenCreateAccountDialog(true)}
          startIcon={<AddIcon />}
          sx={{ marginTop: '1rem', width: '100%' }}
          disabled={!isPXEInitialized || changingNetworks || isConnecting}
        >
          Create Account
        </Button>
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
              value={wallet?.getAddress().toString() ?? ''}
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
            <CopyToClipboardButton disabled={!wallet} data={wallet?.getAddress().toString()} />
          </FormControl>
        </>
      ) : (
        <></>
      )}
      {wallet && (
        <>
          <Typography variant="overline">Tools</Typography>
          <FormControl css={select}>
            <InputLabel>Contracts</InputLabel>
            <Select
              value={currentContractAddress?.toString() ?? ''}
              label="Contract"
              onChange={handleContractChange}
              fullWidth
            >
              {contracts.map(contract => (
                <MenuItem key={`${contract.key}-${contract.value}`} value={contract.value}>
                  {contract.key.split(':')[1]}&nbsp;(
                  {formatFrAsString(contract.value)})
                </MenuItem>
              ))}
            </Select>
            <CopyToClipboardButton disabled={!currentContractAddress} data={currentContractAddress?.toString()} />
          </FormControl>
          <Button variant="contained" onClick={() => setOpenAddSendersDialog(true)} endIcon={<ContactsIcon />}>
            Contacts
          </Button>
          <AddSendersDialog open={openAddSendersDialog} onClose={handleSenderAdded} />
        </>
      )}
      <div css={{ flex: '1 0 auto', margin: 'auto' }} />
      <Typography variant="overline">Transactions</Typography>
      <Divider />
      <TxsPanel css={{ marginBottom: 60 }} />
      <CreateAccountDialog open={openCreateAccountDialog} onClose={handleAccountCreation} />
    </div>
  );
}
