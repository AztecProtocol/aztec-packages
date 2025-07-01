import { useContext, useEffect, useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { createStore } from '@aztec/kv-store/indexeddb';
import { AddNetworksDialog } from './AddNetworkDialog';
import CircularProgress from '@mui/material/CircularProgress';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { AztecContext, AztecEnv, WebLogger } from '../../../aztecEnv';
import { NetworkDB, WalletDB } from '../../../utils/storage';
import { parseAliasedBuffersAsString } from '../../../utils/conversion';
import { navbarButtonStyle, navbarSelect } from '../../../styles/common';
import { NETWORKS } from '../../../utils/networks';
import { useNotifications } from '@toolpad/core/useNotifications';
import NetworkIcon from '@mui/icons-material/Public';
import { DialogTitle, Dialog, DialogContent, IconButton } from '@mui/material';
import { trackButtonClick } from '../../../utils/matomo';
import CloseIcon from '@mui/icons-material/Close';

export function NetworkSelector() {
  const {
    setConnecting,
    setPXE,
    setNetwork,
    setPXEInitialized,
    setWalletDB,
    setAztecNode,
    setLogs,
    setWallet,
    setCurrentContractAddress,
    setCurrentContractArtifact,
    setShowContractInterface,
    setTotalLogCount,
    network,
    connecting,
  } = useContext(AztecContext);

  const [networks, setNetworks] = useState(NETWORKS);
  const [isNetworkStoreInitialized, setIsNetworkStoreInitialized] = useState(false);
  const [openAddNetworksDialog, setOpenAddNetworksDialog] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const [showNetworkDownNotification, setShowNetworkDownNotification] = useState(false);
  const notifications = useNotifications();

  useEffect(() => {
    const initNetworkStore = async () => {
      await AztecEnv.initNetworkStore();
      setIsNetworkStoreInitialized(true);
    };
    initNetworkStore();
  }, []);

  // Connect to the first network automatically
  useEffect(() => {
    if (isNetworkStoreInitialized && !network) {
      handleNetworkChange(NETWORKS[0].nodeURL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNetworkStoreInitialized]);

  useEffect(() => {
    const refreshNetworks = async () => {
      const aliasedBuffers = await NetworkDB.getInstance().listNetworks();
      const aliasedNetworks = parseAliasedBuffersAsString(aliasedBuffers);
      const networks = [
        ...NETWORKS,
        ...aliasedNetworks.map(network => ({
          nodeURL: network.value,
          name: network.key,
          description: 'Custom network',
          hasTestAccounts: false,
          hasSponsoredFPC: true,
        })),
      ];
      setNetworks(networks);
    };
    if (isNetworkStoreInitialized) {
      refreshNetworks();
    }
  }, [isNetworkStoreInitialized]);

  const handleNetworkChange = async (nodeURL: string) => {
    let network = null;
    try {
      setConnecting(true);
      setPXEInitialized(false);
      network = networks.find(network => network.nodeURL === nodeURL);
      const node = await AztecEnv.connectToNode(network.nodeURL);
      setAztecNode(node);
      setNetwork(network);
      setWallet(null);
      setCurrentContractAddress(null);
      setCurrentContractArtifact(null);
      setShowContractInterface(false);
      const pxe = await AztecEnv.initPXE(node, setLogs, setTotalLogCount);
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
      setConnecting(false);
    } catch (error) {
      console.error(error);
      setConnecting(false);
      setNetwork(null);

      // (temp) show a dialog when the testnet connection fails
      // TODO: Remove this once the network is stable
      if (network?.name === 'Aztec Testnet') {
        setShowNetworkDownNotification(true);
      } else {
        notifications.show('Failed to connect to network', {
          severity: 'error',
        });
      }
    }
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
          description: 'Custom network',
          hasTestAccounts: false,
          hasSponsoredFPC: true,
        })),
      ];
      setNetworks(networks);
    }
    setOpenAddNetworksDialog(false);
  };

  if (connecting) {
    return (
      <div css={navbarButtonStyle}>
        <CircularProgress size={20} color="primary" sx={{ marginRight: '1rem' }} />
        <Typography variant="body1">Connecting to {network?.name ?? 'network'}...</Typography>
      </div>
    );
  }

  return (
    <div css={navbarButtonStyle}>
      <NetworkIcon />

      <FormControl css={navbarSelect}>
        <Select
          fullWidth
          value={network?.nodeURL || ''}
          displayEmpty
          variant="outlined"
          IconComponent={KeyboardArrowDownIcon}
          open={isOpen}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          renderValue={selected => {
            if (connecting) {
              return `Connecting to ${network?.name}...`;
            }
            if (selected && network?.nodeURL) {
              return `${network.name}`;
            }
            return 'Select Network';
          }}
          disabled={connecting}
          onChange={e => handleNetworkChange(e.target.value)}
        >
          {networks.map(network => (
            <MenuItem
              key={network.name}
              value={network.nodeURL}
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
            >
              <Typography variant="body1">{network.name}</Typography>
              <Typography variant="caption" color="textSecondary" sx={{ fontSize: '0.7rem' }}>
                {network.description} • {network.nodeURL}
              </Typography>
            </MenuItem>
          ))}

          <MenuItem
            key="create"
            value=""
            onClick={() => {
              trackButtonClick('Add Custom Network', 'Network Selector');
              setOpen(false);
              setOpenAddNetworksDialog(true);
            }}
          >
            <AddIcon sx={{ marginRight: '0.5rem' }} />
            Add custom network
          </MenuItem>
        </Select>
      </FormControl>

      <AddNetworksDialog open={openAddNetworksDialog} onClose={handleNetworkAdded} />

      <Dialog open={showNetworkDownNotification} onClose={() => setShowNetworkDownNotification(false)}>
        <DialogTitle css={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Testnet is congested</span>
          <IconButton onClick={() => setShowNetworkDownNotification(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          <Typography sx={{ marginBottom: '1rem' }}>
            The Playground is currently unavailable with the Public Testnet while we troubleshoot network congestion.
            <br />
            <br />
            Please check back in a few hours or use the Playground with the local sandbox instead. Please visit the{' '}
            <a href="https://docs.aztec.network/developers/getting_started" target="_blank" rel="noopener noreferrer">
              Aztec Docs
            </a>{' '}
            to get started.
          </Typography>
        </DialogContent>
      </Dialog>
    </div>
  );
}
