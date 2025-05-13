import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { css } from '@mui/styled-engine';
import { useState } from 'react';

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
  onClose: (network?: string, alias?: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [network, setNetwork] = useState('');

  const addNetwork = async () => {
    setAlias('');
    setNetwork('');
    onClose(network, alias);
  };

  const handleClose = () => {
    setAlias('');
    setNetwork('');
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Add network</DialogTitle>
      <div css={creationForm}>
        <TextField
          value={network}
          label="Network"
          onChange={event => {
            setNetwork(event.target.value);
          }}
        />
        <TextField
          value={alias}
          label="Alias"
          onChange={event => {
            setAlias(event.target.value);
          }}
        />
        <Button disabled={alias === '' || network === ''} onClick={addNetwork}>
          Add
        </Button>
        <Button color="error" onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
