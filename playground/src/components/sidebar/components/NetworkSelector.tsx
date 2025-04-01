import { useState } from 'react';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import type { Network } from '../types';
import { select, sectionHeader } from '../styles';
import { connectToNetwork } from '../utils/networkHelpers';
import { AddNetworksDialog } from './addNetworkDialog';

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

  const handleNetworkChange = async (event: SelectChangeEvent) => {
    const networkUrl = event.target.value;
    if (networkUrl === '') {
      return;
    }
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
    } finally {
      setChangingNetworks(false);
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

  return (
    <>
      <Typography variant="overline" sx={{
        fontFamily: '"Space Grotesk", sans-serif',
        fontWeight: 600,
        fontSize: '17px',
        color: '#000000',
        marginTop: '1.5rem',
        display: 'block'
      }}>
        Connect to Network
      </Typography>

      <FormControl css={select}>
        <InputLabel>Network</InputLabel>
        <Select
          fullWidth
          value={currentNodeURL || ''}
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
    </>
  );
}
