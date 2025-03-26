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
import { CopyToClipboardButton } from '../common/copyToClipboardButton';
import { AddSendersDialog } from './components/addSenderDialog';
import { TxsPanel } from './components/txsPanel';
import { AddNetworksDialog } from './components/addNetworkDialog';
import CodeIcon from '@mui/icons-material/Code';
import ContactsIcon from '@mui/icons-material/Contacts';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { IconButton } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import ListSubheader from '@mui/material/ListSubheader';

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
    nodeURL:'http://104.198.9.16:8080/',
    name: 'Aztec Devnet',
    description: 'Public development network',
  },
  {
    nodeURL: 'http://localhost:8080',
    name: 'Local Sandbox',
    description: 'Run your own sandbox',
  },
];

async function getInitialEcdsaKTestAccounts() {
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.map(async (secret, i) => {
      // Create a fixed deterministic Buffer for each account's signing key
      const signingKey = Buffer.alloc(32);
      // Fill with a pattern based on index to make it deterministic but unique
      signingKey.write(`test-key-${i}`.padEnd(32, '-'), 0, 32, 'utf8');
      const salt = INITIAL_TEST_ACCOUNT_SALTS[i];

      return {
        secret,
        signingKey,
        salt
      };
    })
  );
}

const PREDEFINED_CONTRACTS = {
  SIMPLE_VOTING: 'simple_voting',
  SIMPLE_TOKEN: 'simple_token',
  CUSTOM_UPLOAD: 'custom_upload'
};

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
    selectedPredefinedContract,
    wallet,
    walletDB,
    nodeURL,
    isPXEInitialized,
    pxe,
    setSelectedPredefinedContract,
    setShowContractInterface,
  } = useContext(AztecContext);
  const [changingNetworks, setChangingNetworks] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [networks, setNetworks] = useState(NETWORKS);
  const [openAddNetworksDialog, setOpenAddNetworksDialog] = useState(false);
  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);
  const [openAddSendersDialog, setOpenAddSendersDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

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

  const getAccountsAndSenders = async (): Promise<{ ourAccounts: any[]; senders: any[] }> => {
    console.log('=== LOADING ACCOUNTS ===');

    try {
      // Get existing accounts from the wallet database
      const aliasedBuffers = await walletDB.listAliases('accounts');
      const aliasedAccounts = parseAliasedBuffersAsString(aliasedBuffers);
      console.log('Found stored accounts:', aliasedAccounts);

      // Use ECDSA K test accounts
      const testAccountData = await getInitialEcdsaKTestAccounts();
      console.log('Test account data prepared:', testAccountData.length);

      let i = 0;
      for (const accountData of testAccountData) {
        try {
          console.log(`Processing test account ${i}...`);

          // Import specifically the ECDSA K account functions
          const { getEcdsaKAccount } = await import('@aztec/accounts/ecdsa/lazy');

          // Create account manager with the account data
          console.log(`Creating account manager for test account ${i}...`);
          const account: AccountManager = await getEcdsaKAccount(
            pxe,
            accountData.secret,
            accountData.signingKey,
            accountData.salt,
          );

          // Check if this account already exists in our database
          const accountAddress = account.getAddress().toString();
          console.log(`Account ${i} address: ${accountAddress}`);

          const existingAccount = aliasedAccounts.find(({ value }) => {
            try {
              return value === accountAddress;
            } catch (e) {
              return false;
            }
          });

          if (!existingAccount) {
            console.log(`Account ${i} not found in database, registering...`);

            // Register account with PXE
            await account.register();
            console.log(`Account ${i} registered with PXE`);

            const instance = account.getInstance();
            const wallet = await account.getWallet();
            const alias = `ecdsa${i}`;

            // Store account info
            await walletDB.storeAccount(instance.address, {
              type: 'ecdsasecp256k1',
              secretKey: wallet.getSecretKey(),
              alias,
              salt: account.getInstance().salt,
            });

            // Store signing key as metadata
            await walletDB.storeAccountMetadata(instance.address, 'signingPrivateKey', accountData.signingKey);
            console.log(`Account ${i} metadata stored`);

            // Add to our list
            aliasedAccounts.push({
              key: `accounts:${alias}`,
              value: instance.address.toString(),
            });

            console.log(`Account ${i} (${alias}) registered successfully`);
          } else {
            console.log(`Account ${i} already exists as ${existingAccount.key}`);
          }
        } catch (error) {
          console.error(`Error processing test account ${i}:`, error);
        }
        i++;
      }

      // Get the list of accounts registered with the PXE
      console.log('Getting registered accounts from PXE...');
      const pxeAccounts = await pxe.getRegisteredAccounts();
      console.log('PXE registered accounts:', pxeAccounts.map(a => a.address.toString()));

      // Filter our accounts to match those in the PXE
      const ourAccounts = [];
      const senders = [];

      console.log('Matching stored accounts with PXE accounts...');
      for (const alias of aliasedAccounts) {
        try {
          const address = AztecAddress.fromString(alias.value);
          const matchingPxeAccount = pxeAccounts.find(account => account.address.equals(address));

          if (matchingPxeAccount) {
            console.log(`Account ${alias.key} is registered with PXE`);
            ourAccounts.push(alias);
          } else {
            console.log(`Account ${alias.key} is not registered with PXE, treating as sender`);
            senders.push(alias.key, alias.value);
          }
        } catch (e) {
          console.error('Error processing alias:', e);
        }
      }

      console.log('Our accounts:', ourAccounts);
      console.log('Senders:', senders);
      console.log('=== ACCOUNTS LOADED SUCCESSFULLY ===');

      return { ourAccounts, senders };
    } catch (error) {
      console.error('=== ERROR LOADING ACCOUNTS ===', error);
      return { ourAccounts: [], senders: [] };
    }
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
      return;
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

      // Retrieve the signing private key from metadata
      const signingPrivateKey = await walletDB.retrieveAccountMetadata(accountAddress, 'signingPrivateKey');

      if (!signingPrivateKey) {
        throw new Error('Could not find signing private key for this account');
      }

      console.log('Using stored signing private key');

      // Import the correct functions for ECDSA K
      const { getEcdsaKWallet } = await import('@aztec/accounts/ecdsa/lazy');

      // Use getEcdsaKWallet which takes the account address and private key
      console.log('Creating wallet for existing account...');
      const newWallet = await getEcdsaKWallet(
        pxe,
        accountAddress,
        signingPrivateKey,
      );
      console.log('Successfully switched to account:', accountAddress.toString());

      // Cast newWallet to AccountWalletWithSecretKey, as getEcdsaKWallet returns AccountWallet
      // This is a temporary fix and might need a proper solution
      setWallet(newWallet as unknown as AccountWalletWithSecretKey);
    } catch (error) {
      console.error('Error changing account:', error);
    }
  };

  const handleAccountCreation = async (account?: AccountWalletWithSecretKey, salt?: Fr, alias?: string) => {
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
    const contractValue = event.target.value;

    if (contractValue === PREDEFINED_CONTRACTS.SIMPLE_VOTING) {
      setSelectedPredefinedContract(PREDEFINED_CONTRACTS.SIMPLE_VOTING);
      setCurrentContractAddress(null);
      setShowContractInterface(true);
      return;
    } else if (contractValue === PREDEFINED_CONTRACTS.SIMPLE_TOKEN) {
      setSelectedPredefinedContract(PREDEFINED_CONTRACTS.SIMPLE_TOKEN);
      setCurrentContractAddress(null);
      setShowContractInterface(true);
      return;
    } else if (contractValue === PREDEFINED_CONTRACTS.CUSTOM_UPLOAD) {
      setSelectedPredefinedContract(PREDEFINED_CONTRACTS.CUSTOM_UPLOAD);
      setCurrentContractAddress(null);
      setShowContractInterface(true);
      return;
    }

    if (contractValue === '') {
      return;
    }

    try {
      setSelectedPredefinedContract('');

      const contractAddress = AztecAddress.fromString(contractValue);
      setCurrentContractAddress(contractAddress);
      setShowContractInterface(true);
    } catch (error) {
      console.error('Error setting contract address:', error);
    }
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

  const handleShowContractInterface = () => {
    setShowContractInterface(true);
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

      {/* Always show Contracts section, but disable it until an account is selected */}
      <div style={{ marginTop: '1.5rem', opacity: wallet ? 1 : 0.5 }}>
        <Typography variant="overline">Contracts</Typography>
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
        <Button
          variant="contained"
          onClick={() => setOpenAddSendersDialog(true)}
          endIcon={<ContactsIcon />}
          disabled={!wallet}
          sx={{ mt: 1 }}
        >
          Contacts
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={handleShowContractInterface}
          endIcon={<CodeIcon />}
          disabled={!wallet}
          sx={{ mt: 1, width: '100%' }}
        >
          Start Coding
        </Button>
        <AddSendersDialog open={openAddSendersDialog} onClose={handleSenderAdded} />
      </div>

      <div css={{ flex: '1 0 auto', margin: 'auto' }} />
      <Typography variant="overline">Transactions</Typography>
      <Divider />
      <TxsPanel css={{ marginBottom: 60 }} />
      <CreateAccountDialog open={openCreateAccountDialog} onClose={handleAccountCreation} />
    </div>
  );
}
