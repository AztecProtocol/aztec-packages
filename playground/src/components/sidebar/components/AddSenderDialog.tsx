import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { AztecAddress } from '@aztec/aztec.js';
import { FormGroup } from '@mui/material';
import { dialogBody, form } from '../../../styles/common';
import { InfoText } from '../../common/InfoText';
import { INFO_TEXT } from '../../../constants';
import Typography from '@mui/material/Typography';

export function AddSendersDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (sender?: AztecAddress, alias?: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [sender, setSender] = useState('');

  const [error, setError] = useState(null);

  const addSender = async () => {
    try {
      const parsed = AztecAddress.fromString(sender);
      onClose(parsed, alias);
    } catch (e) {
      setError('Invalid Aztec address');
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Add contact</DialogTitle>
      <div css={dialogBody}>
        <FormGroup css={form}>
          <TextField
            required
            value={sender}
            label="Contact"
            onChange={event => {
              setSender(event.target.value);
            }}
          />
          <InfoText>{INFO_TEXT.CONTACTS}</InfoText>
          <TextField
            required
            value={alias}
            label="Alias"
            onChange={event => {
              setAlias(event.target.value);
            }}
          />
        </FormGroup>
        <InfoText>{INFO_TEXT.ALIASES}</InfoText>
        <div css={{ flexGrow: 1, margin: 'auto' }}></div>
        {!error ? (
          <Button disabled={alias === '' || sender === ''} onClick={addSender}>
            Add
          </Button>
        ) : (
          <Typography variant="body2" sx={{ mr: 1 }} color="warning.main">
            An error occurred: {error}
          </Typography>
        )}
        <Button color="error" onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
