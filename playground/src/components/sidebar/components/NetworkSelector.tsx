import { useContext, useEffect, useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import { createStore } from '@aztec/kv-store/indexeddb';
import { AddNetworksDialog } from './AddNetworkDialog';
import { css } from '@emotion/react';
import CircularProgress from '@mui/material/CircularProgress';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { AztecContext, AztecEnv, WebLogger } from '../../../aztecEnv';
import { NetworkDB, WalletDB } from '../../../utils/storage';
import { parseAliasedBuffersAsString } from '../../../utils/conversion';
import { select } from '../../../styles/common';
import { NETWORKS } from '../../../utils/networks';

const modalContainer = css({
  padding: '10px 0',
});

const errorMessageStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  marginTop: '12px',
  backgroundColor: 'rgba(211, 47, 47, 0.1)',
  borderRadius: '8px',
  color: '#d32f2f',
  fontSize: '14px',
  lineHeight: '1.4',
});

const errorIcon = css({
  fontSize: '20px',
});

const loadingContainer = css({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '20px 0',
  gap: '10px',
});

interface NetworkSelectorProps {}

export function NetworkSelector({}: NetworkSelectorProps) {
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
    setConnecting(true);
    setPXEInitialized(false);
    const network = networks.find(network => network.nodeURL === nodeURL);
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

  // // Renders the appropriate error message based on network type
  // const renderErrorMessage = () => {
  //   if (isSandboxError) {
  //     return (
  //       <>
  //         {errorText}
  //         <br /> Do you have a sandbox running? Check out the{' '}
  //         <Link href="https://docs.aztec.network" target="_blank" rel="noopener">
  //           docs
  //         </Link>
  //       </>
  //     );
  //   } else if (isTestnetError) {
  //     return (
  //       <>
  //         {errorText}
  //         <br />
  //         <br /> Testnet may be down. Please see our Discord for updates.
  //       </>
  //     );
  //   } else {
  //     return (
  //       <>
  //         {errorText}
  //         <br />
  //         <br /> Are your network details correct? Please reach out on Discord for help troubleshooting.
  //       </>
  //     );
  //   }
  // };

  return (
    <>
      {connecting ? (
        <div css={loadingContainer}>
          <CircularProgress size={24} />
          <Typography variant="body2">Connecting to network...</Typography>
        </div>
      ) : (
        <div css={modalContainer}>
          <FormControl css={select}>
            <Select
              fullWidth
              value={network?.nodeURL || ''}
              displayEmpty
              IconComponent={KeyboardArrowDownIcon}
              open={isOpen}
              onOpen={() => setOpen(true)}
              onClose={() => setOpen(false)}
              renderValue={selected => {
                if (connecting) {
                  return `Connecting to ${network?.name}...`;
                }
                if (selected && network?.nodeURL) {
                  return `${network.name}@${network.nodeURL}`;
                }
                return 'Select Network';
              }}
              disabled={connecting}
              onChange={(e) => handleNetworkChange(e.target.value)}
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
                  setOpen(false);
                  setOpenAddNetworksDialog(true);
                }}
              >
                <AddIcon />
                &nbsp;Add custom network
              </MenuItem>
            </Select>
          </FormControl>

          {/* {connectionError && (
        <div css={errorMessageStyle}>
          <ErrorOutlineIcon css={errorIcon} />
          <div>{renderErrorMessage()}</div>
        </div>
      )} */}
        </div>
      )}
      <AddNetworksDialog open={openAddNetworksDialog} onClose={handleNetworkAdded} />
    </>
  );
}
