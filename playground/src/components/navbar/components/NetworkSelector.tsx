import { useContext, useEffect, useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { AddNetworksDialog } from './AddNetworkDialog';
import CircularProgress from '@mui/material/CircularProgress';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { createStore } from '@aztec/kv-store/indexeddb';
import { AztecContext } from '../../../aztecContext';
import { navbarButtonStyle, navbarSelect } from '../../../styles/common';
import { NETWORKS } from '../../../utils/networks';
import { useNotifications } from '@toolpad/core/useNotifications';
import NetworkIcon from '@mui/icons-material/Public';
import { DialogTitle, Dialog, DialogContent, IconButton } from '@mui/material';
import { trackButtonClick } from '../../../utils/matomo';
import CloseIcon from '@mui/icons-material/Close';
import { PlaygroundDB } from '../../../utils/storage';
import { WebLogger } from '../../../utils/web_logger';
import { createAztecNodeClient } from '@aztec/aztec.js/node';

export function NetworkSelector() {
  const {
    setNode,
    setNetwork,
    setLogs,
    setWallet,
    setCurrentContractAddress,
    setCurrentContractArtifact,
    setShowContractInterface,
    setTotalLogCount,
    setPlaygroundDB,
    network,
    playgroundDB,
  } = useContext(AztecContext);

  const [connecting, setConnecting] = useState(false);
  const [networks, setNetworks] = useState(NETWORKS);
  const [isContextInitialized, setIsContextInitialized] = useState(false);
  const [openAddNetworksDialog, setOpenAddNetworksDialog] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const [showNetworkDownNotification, setShowNetworkDownNotification] = useState(false);
  const notifications = useNotifications();

  useEffect(() => {
    const initAztecEnv = async () => {
      if (isContextInitialized) {
        return;
      }
      setIsContextInitialized(true);
      WebLogger.create(setLogs, setTotalLogCount);
      const store = await createStore('playground_data', {
        dataDirectory: 'playground',
        dataStoreMapSizeKb: 1e6,
      });
      const playgroundDB = PlaygroundDB.getInstance();
      playgroundDB.init(store, WebLogger.getInstance().createLogger('playground_db').info);
      setPlaygroundDB(PlaygroundDB.getInstance());
    };
    initAztecEnv();
  }, []);

  // Connect to the first network automatically
  useEffect(() => {
    if (isContextInitialized && !network) {
      handleNetworkChange(NETWORKS[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContextInitialized]);

  useEffect(() => {
    const refreshNetworks = async () => {
      const storedNetworks = await playgroundDB.listNetworks();
      const updatedNetworks = [
        ...NETWORKS,
        ...storedNetworks.map(net => ({
          nodeURL: net.networkUrl,
          name: net.alias,
          description:
            net.chainId && net.version ? `Chain ID: ${net.chainId} • Version: ${net.version}` : 'Custom network',
          hasTestAccounts: false,
          hasSponsoredFPC: true,
          chainId: net.chainId,
          version: net.version,
          nodeVersion: net.nodeVersion,
        })),
      ];
      setNetworks(updatedNetworks);
    };
    if (isContextInitialized && playgroundDB) {
      refreshNetworks();
    }
  }, [isContextInitialized, playgroundDB]);

  const handleNetworkChange = async (name: string) => {
    if (!name) {
      return;
    }

    let network = null;
    try {
      network = networks.find(network => network.name === name);
      if (!network) {
        throw new Error('Network not found');
      }
      setNetwork(network);
      setWallet(null);
      setCurrentContractAddress(null);
      setCurrentContractArtifact(null);
      setShowContractInterface(false);
      setConnecting(true);
      setNode(await createAztecNodeClient(network.nodeURL));
    } catch (error) {
      console.error(error);
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
    } finally {
      setConnecting(false);
    }
  };

  const handleNetworkAdded = async (
    networkUrl?: string,
    alias?: string,
    chainId?: number,
    version?: string,
    nodeVersion?: string,
  ) => {
    if (networkUrl && alias && chainId && version) {
      try {
        await playgroundDB.storeNetwork(networkUrl, alias, chainId, version, nodeVersion);
        const storedNetworks = await playgroundDB.listNetworks();
        const updatedNetworks = [
          ...NETWORKS,
          ...storedNetworks.map(net => ({
            nodeURL: net.networkUrl,
            name: net.alias,
            description:
              net.chainId && net.version ? `Chain ID: ${net.chainId} • Version: ${net.version}` : 'Custom network',
            hasTestAccounts: false,
            hasSponsoredFPC: true,
            chainId: net.chainId,
            version: net.version,
            nodeVersion: net.nodeVersion,
          })),
        ];
        setNetworks(updatedNetworks);

        // Automatically connect to the newly added network
        // Find the network in updatedNetworks instead of relying on state
        const newNetwork = updatedNetworks.find(net => net.name === alias);
        if (newNetwork) {
          setNetwork(newNetwork);
          setWallet(null);
          setCurrentContractAddress(null);
          setCurrentContractArtifact(null);
          setShowContractInterface(false);
          setConnecting(true);
          try {
            setNode(await createAztecNodeClient(newNetwork.nodeURL));
          } catch (error) {
            console.error(error);
            setNetwork(null);
            notifications.show('Failed to connect to network', {
              severity: 'error',
            });
          } finally {
            setConnecting(false);
          }
        }
      } catch (error) {
        console.error('Error in handleNetworkAdded:', error);
        notifications.show('Failed to add network: ' + (error instanceof Error ? error.message : 'Unknown error'), {
          severity: 'error',
        });
      }
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
          value={network?.name || ''}
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
          MenuProps={{
            disableScrollLock: true,
            PaperProps: {
              sx: {
                width: '300px',
                marginLeft: '-12px',
                '@media (max-width: 900px)': {
                  width: '100vw',
                  marginLeft: 0,
                },
              },
            },
          }}
        >
          {networks.map(network => (
            <MenuItem
              key={network.name}
              value={network.name}
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
            >
              <Typography variant="body1">{network.name}</Typography>
              <Typography variant="caption" color="textSecondary" sx={{ fontSize: '0.7rem' }}>
                {network.description}
              </Typography>
              <Typography variant="caption" color="textSecondary" sx={{ fontSize: '0.7rem' }}>
                {network.nodeURL}
              </Typography>
            </MenuItem>
          ))}

          <MenuItem
            key="create"
            value=""
            onClick={e => {
              e.stopPropagation();
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
          <span>The network is congested</span>
          <IconButton onClick={() => setShowNetworkDownNotification(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          <Typography sx={{ marginBottom: '1rem' }}>
            The Playground is currently unavailable with the Public Testnet while we troubleshoot network congestion.
            <br />
            <br />
            Please check back in a few hours or use the Playground with the local network instead. Please visit the{' '}
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
