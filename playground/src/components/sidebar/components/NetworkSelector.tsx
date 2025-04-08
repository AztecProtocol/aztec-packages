import { useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import type { Network } from '../types';
import { select } from '../styles';
import { connectToNetwork, NetworkConnectionError } from '../utils/networkHelpers';
import { AddNetworksDialog } from './addNetworkDialog';
import { css } from '@emotion/react';
import Link from '@mui/material/Link';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CircularProgress from '@mui/material/CircularProgress';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

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

interface NetworkSelectorProps {
  networks: Network[];
  currentNodeURL: string | null;
  onNetworksChange: (networks: Network[]) => void;
  setNodeURL: (url: string) => void;
  setPXEInitialized: (initialized: boolean) => void;
  setAztecNode: (node: any) => void;
  setPXE: (pxe: any) => void;
  setWalletDB: (walletDB: any) => void;
  setLogs: (logs: any) => void;
  setChangingNetworks: (changing: boolean) => void;
}

export function NetworkSelector({
  networks,
  currentNodeURL,
  onNetworksChange,
  setNodeURL,
  setPXEInitialized,
  setAztecNode,
  setPXE,
  setWalletDB,
  setLogs,
  setChangingNetworks
}: NetworkSelectorProps) {
  const [openAddNetworksDialog, setOpenAddNetworksDialog] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSandboxError, setIsSandboxError] = useState(false);
  const [isTestnetError, setIsTestnetError] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const getNetworkType = (networkUrl: string) => {
    // Check if this is a sandbox network
    const isSandbox = networkUrl.includes('localhost') || networkUrl.includes('127.0.0.1');

    // Check if this is a testnet
    const isTestnet = networkUrl.includes('devnet') || networkUrl.includes('test');

    return { isSandbox, isTestnet };
  };

  const getCurrentNetworkName = () => {
    if (!currentNodeURL) return '';
    const network = networks.find(n => n.nodeURL === currentNodeURL);
    return network ? network.name : 'Custom Network';
  };

  const handleNetworkChange = async (event: SelectChangeEvent) => {
    const networkUrl = event.target.value;
    if (networkUrl === '') {
      return;
    }

    setIsLoading(true);
    setConnectionError(null);
    setErrorText('');
    setIsSandboxError(false);
    setIsTestnetError(false);
    setChangingNetworks(true);

    try {
      await connectToNetwork(
        networkUrl,
        setNodeURL,
        setPXEInitialized,
        setAztecNode,
        setPXE,
        setWalletDB,
        setLogs
      );
    } catch (error) {
      console.error('Network connection error:', error);

      const { isSandbox, isTestnet } = getNetworkType(networkUrl);
      setIsSandboxError(isSandbox);
      setIsTestnetError(isTestnet);
      setConnectionError(networkUrl);

      if (error instanceof NetworkConnectionError) {
        setErrorText(error.message);
      } else {
        setErrorText('Failed to connect to network');
      }
    } finally {
      setChangingNetworks(false);
      setIsLoading(false);
    }
  };

  const handleNetworkAdded = async (network?: string, alias?: string) => {
    if (network && alias) {
      // Add the network to the NetworkDB
      try {
        const { addNetwork, loadNetworks } = await import('../utils/networkHelpers');
        await addNetwork(alias, network);
        const updatedNetworks = await loadNetworks();
        onNetworksChange(updatedNetworks);
      } catch (error) {
        console.error('Error adding network:', error);
      }
    }
    setOpenAddNetworksDialog(false);
  };

  // Renders the appropriate error message based on network type
  const renderErrorMessage = () => {
    if (isSandboxError) {
      return (
        <>
          {errorText}
          <br/> Do you have a sandbox running? Check out the <Link href="https://docs.aztec.network" target="_blank" rel="noopener">docs</Link>
        </>
      );
    } else if (isTestnetError) {
      return (
        <>
          {errorText}
          <br/><br/> Testnet may be down. Please see our Discord for updates.
        </>
      );
    } else {
      return (
        <>
          {errorText}
          <br/><br/> Are your network details correct? Please reach out on Discord for help troubleshooting.
        </>
      );
    }
  };

  return (
    <div css={modalContainer}>
      <FormControl css={select}>
        <Select
          fullWidth
          value={currentNodeURL || ''}
          displayEmpty
          IconComponent={KeyboardArrowDownIcon}
          open={isOpen}
          onOpen={() => setIsOpen(true)}
          onClose={() => setIsOpen(false)}
          renderValue={(selected) => {
            if (isLoading) {
              return 'Connecting to network...';
            }
            if (selected && currentNodeURL) {
              return `Connected to ${getCurrentNetworkName()}`;
            }
            return 'Select Network';
          }}
          disabled={isLoading}
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
          <MenuItem key="create" value="" onClick={() => {
            setIsOpen(false);
            setOpenAddNetworksDialog(true);
          }}>
            <AddIcon />
            &nbsp;Add custom network
          </MenuItem>
        </Select>
      </FormControl>

      {isLoading && (
        <div css={loadingContainer}>
          <CircularProgress size={24} />
          <Typography variant="body2">
            Connecting to network...
          </Typography>
        </div>
      )}

      {connectionError && (
        <div css={errorMessageStyle}>
          <ErrorOutlineIcon css={errorIcon} />
          <div>{renderErrorMessage()}</div>
        </div>
      )}

      <AddNetworksDialog open={openAddNetworksDialog} onClose={handleNetworkAdded} />
    </div>
  );
}
