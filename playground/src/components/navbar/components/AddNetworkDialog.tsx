import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { css } from '@mui/styled-engine';
import { useState } from 'react';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

const creationForm = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1rem',
  alignItems: 'center',
});

export function AddNetworksDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (network?: string, alias?: string, chainId?: number, version?: string, nodeVersion?: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [network, setNetwork] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addNetwork = async () => {
    setLoading(true);
    setError(null);

    try {
      // Create ephemeral node client to fetch node info
      const node = await createAztecNodeClient(network);
      const nodeInfo = await node.getNodeInfo();

      const chainId = nodeInfo.l1ChainId;
      const version = nodeInfo.rollupVersion.toString();
      const nodeVersion = nodeInfo.nodeVersion;

      // Store values before clearing state
      const networkUrl = network;
      const networkAlias = alias;

      setAlias('');
      setNetwork('');
      onClose(networkUrl, networkAlias, chainId, version, nodeVersion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to network');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAlias('');
    setNetwork('');
    setError(null);
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Add network</DialogTitle>
      <div css={creationForm}>
        <TextField
          value={network}
          label="Network RPC URL"
          onChange={event => {
            setNetwork(event.target.value);
            setError(null);
          }}
          disabled={loading}
          fullWidth
        />
        <TextField
          value={alias}
          label="Alias"
          onChange={event => {
            setAlias(event.target.value);
          }}
          disabled={loading}
          fullWidth
        />
        {error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}
        <Button disabled={alias === '' || network === '' || loading} onClick={addNetwork}>
          {loading ? <CircularProgress size={20} /> : 'Add'}
        </Button>
        <Button color="error" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
