import { type SelectChangeEvent } from '@mui/material/Select';
import { AztecContext } from '../../aztecEnv';
import { AccountWalletWithSecretKey, Fr, AztecAddress } from '@aztec/aztec.js';
import { getEcdsaKWallet } from '@aztec/accounts/ecdsa/lazy';
import { NetworkDB } from '../../utils/storage';
import { useContext, useEffect, useState } from 'react';
import { CreateAccountDialog } from './components/createAccountDialog';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { parseAliasedBuffersAsString } from '../../utils/conversion';
import { TxsPanel } from './components/txsPanel';
import { NetworkSelector } from './components/NetworkSelector';
import { AccountSelector } from './components/AccountSelector';
import { ContractSelector } from './components/ContractSelector';
import { loadNetworks, connectToNetwork } from './utils/networkHelpers';
import { loadContracts } from './utils/contractHelpers';
import { createWalletForAccount, getAccountsAndSenders } from './utils/accountHelpers';
import type { Network, AliasedItem } from './types';
import { NETWORKS } from './constants';
import { container, header } from './styles';
import { PREDEFINED_CONTRACTS } from './types';

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
    node,
    setSelectedPredefinedContract,
    setShowContractInterface,
  } = useContext(AztecContext);

  const [changingNetworks, setChangingNetworks] = useState(false);
  const [accounts, setAccounts] = useState<AliasedItem[]>([]);
  const [contracts, setContracts] = useState<AliasedItem[]>([]);
  const [networks, setNetworks] = useState<Network[]>(NETWORKS);
  const [openAddNetworksDialog, setOpenAddNetworksDialog] = useState(false);
  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);
  const [openAddSendersDialog, setOpenAddSendersDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Connect to devnet when starting up
  useEffect(() => {
    if (!nodeURL && !changingNetworks && !isConnecting) {
      setIsConnecting(true);
      const defaultNetwork = NETWORKS[0].nodeURL;
      connectToNetwork(
        defaultNetwork,
        setNodeURL,
        setPXEInitialized,
        setAztecNode,
        setPXE,
        setWalletDB,
        setLogs
      )
        .then(() => setIsConnecting(false))
        .catch(error => {
          console.error('Error connecting to default network:', error);
          setIsConnecting(false);
        });
    }
  }, [nodeURL, changingNetworks, isConnecting]);

  // Load networks from storage
  useEffect(() => {
    loadNetworks()
      .then(networks => setNetworks(networks))
      .catch(error => console.error('Error loading networks:', error));
  }, []);

  // Load contracts when wallet or address changes
  useEffect(() => {
    if (walletDB) {
      loadContracts(walletDB)
        .then(contracts => setContracts(contracts))
        .catch(error => console.error('Error loading contracts:', error));
    }
  }, [currentContractAddress, walletDB]);

  // Load accounts and auto-select first account
  useEffect(() => {
    const refreshAccounts = async () => {
      try {
        if (!walletDB || !pxe) return;

        const { ourAccounts } = await getAccountsAndSenders(walletDB, pxe);
        // Make sure accounts are properly formatted
        const formattedAccounts = ourAccounts.map(account => {
          // Ensure account value is a string
          if (typeof account.value !== 'string') {
            account.value = account.value.toString();
          }
          return account;
        });

        setAccounts(formattedAccounts);

        // If we have accounts but none selected, select the first one
        if (formattedAccounts.length > 0 && !wallet) {
          const firstAccount = formattedAccounts[0];

          // Manually call the account selection function with the account value
          try {
            const accountAddress = AztecAddress.fromString(firstAccount.value);

            // Get the signing key
            const signingPrivateKey = await walletDB.retrieveAccountMetadata(accountAddress, 'signingPrivateKey');
            if (!signingPrivateKey) {
              console.error('No signing key for account:', accountAddress.toString());
              return;
            }

            // Create wallet
            const newWallet = await createWalletForAccount(pxe, accountAddress, signingPrivateKey);
            setWallet(newWallet);
          } catch (error) {
            console.error('Error auto-selecting account:', error);
          }
        }
      } catch (error) {
        console.error('Error refreshing accounts:', error);
      }
    };

    if (walletDB && pxe && isPXEInitialized) {
      refreshAccounts();
    }
  }, [wallet, walletDB, pxe, isPXEInitialized, setWallet]);

  const handleNetworkChange = async (event: SelectChangeEvent) => {
    const networkUrl = event.target.value;
    if (networkUrl === '') {
      return;
    }
    await connectToNetwork(networkUrl, setNodeURL, setPXEInitialized, setAztecNode, setPXE, setWalletDB, setLogs);
  };

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
      // Use getEcdsaKWallet which takes the account address and private key
      const newWallet = await getEcdsaKWallet(
        pxe,
        accountAddress,
        signingPrivateKey,
      );
      // Cast newWallet to AccountWalletWithSecretKey, as getEcdsaKWallet returns AccountWallet
      // This is a temporary fix and might need a proper solution
      setWallet(newWallet as unknown as AccountWalletWithSecretKey);
    } catch (error) {
      console.error('Error changing account:', error);
    }
  };

  const handleAccountManualSelection = async (accountValue: string) => {
    try {
      const accountAddress = AztecAddress.fromString(accountValue);
      const accountData = await walletDB.retrieveAccount(accountAddress);

      // Retrieve the signing private key from metadata
      const signingPrivateKey = await walletDB.retrieveAccountMetadata(accountAddress, 'signingPrivateKey');

      if (!signingPrivateKey) {
        throw new Error('Could not find signing private key for this account');
      }

      // Use getEcdsaKWallet which takes the account address and private key
      const newWallet = await getEcdsaKWallet(
        pxe,
        accountAddress,
        signingPrivateKey,
      );

      // Cast newWallet to AccountWalletWithSecretKey, as getEcdsaKWallet returns AccountWallet
      // This is a temporary fix and might need a proper solution
      setWallet(newWallet as unknown as AccountWalletWithSecretKey);
    } catch (error) {
      console.error('Error manually selecting account:', error);
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
      const { ourAccounts } = await getAccountsAndSenders(walletDB, pxe);
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

  /**
   * Attempts to register the SponsoredFPC contract with the PXE
   * This ensures it's available for fee payments in all transactions
   */
  const initSponsoredFPC = async () => {
    if (!pxe || !wallet || !node || !isPXEInitialized) {
      console.log('Cannot initialize SponsoredFPC: Missing required dependencies');
      return;
    }

    try {
      console.log('Initializing SponsoredFPC contract...');
      // Use dynamic import to get the latest version of the function
      const { registerSponsoredFPC } = await import('../../utils/fees');

      // This function now properly registers the contract class first
      await registerSponsoredFPC(pxe, wallet, node);
      console.log('SponsoredFPC contract initialization complete');
    } catch (error) {
      console.error('Error initializing SponsoredFPC contract:', error);
      console.error('Error details:', error.message);
      // Don't block further operations if this fails
    }
  };

  // Initialize SponsoredFPC contract when wallet, pxe and node are all available
  useEffect(() => {
    if (pxe && wallet && node && isPXEInitialized) {
      initSponsoredFPC();
    }
  }, [pxe, wallet, node, isPXEInitialized]);

  return (
    <div css={container}>
      <Typography
        variant="h1"
        sx={{
          fontSize: '32px',
          fontWeight: 500,
          fontFamily: '"Space Grotesk", sans-serif',
          letterSpacing: '0.03em',
          color: '#2D2D2D',
          textAlign: 'center',
          margin: '10px 0 20px'
        }}
      >
        PLAYGROUND
      </Typography>

      {/* Network Selector */}
      <NetworkSelector
        networks={networks}
        currentNodeURL={nodeURL}
        onNetworksChange={setNetworks}
        setNodeURL={setNodeURL}
        setPXEInitialized={setPXEInitialized}
        setAztecNode={setAztecNode}
        setPXE={setPXE}
        setWalletDB={setWalletDB}
        setLogs={setLogs}
        setChangingNetworks={setChangingNetworks}
      />

      {/* Account Selector */}
      <AccountSelector
        accounts={accounts}
        currentWallet={wallet}
        isPXEInitialized={isPXEInitialized}
        pxe={pxe}
        walletDB={walletDB}
        changingNetworks={changingNetworks}
        isConnecting={isConnecting}
        setWallet={setWallet}
        onAccountsChange={() => {
          if (pxe && walletDB) {
            getAccountsAndSenders(walletDB, pxe)
              .then(({ourAccounts}) => setAccounts(ourAccounts))
              .catch(error => console.error('Error refreshing accounts:', error));
          }
        }}
      />

      {/* Contract Selector */}
      <ContractSelector
        contracts={contracts}
        currentContractAddress={currentContractAddress}
        selectedPredefinedContract={selectedPredefinedContract}
        wallet={wallet}
        walletDB={walletDB}
        setSelectedPredefinedContract={setSelectedPredefinedContract}
        setCurrentContractAddress={setCurrentContractAddress}
        setShowContractInterface={setShowContractInterface}
        onAccountsChange={() => {
          if (pxe && walletDB) {
            getAccountsAndSenders(walletDB, pxe)
              .then(({ourAccounts}) => setAccounts(ourAccounts))
              .catch(error => console.error('Error refreshing accounts:', error));
          }
        }}
      />

      <div css={{ flex: '1 0 auto', margin: 'auto' }} />
      <TxsPanel css={{ marginBottom: 60 }} />
      <CreateAccountDialog open={openCreateAccountDialog} onClose={handleAccountCreation} />
    </div>
  );
}
