import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useContext, useEffect, useState } from 'react';
import { AztecAddress } from '@aztec/aztec.js';
import { Box, DialogActions, DialogContent, DialogContentText, FormGroup } from '@mui/material';
import { dialogBody, form } from '../../../styles/common';
import { InfoText } from '../../common/InfoText';
import { INFO_TEXT } from '../../../constants';
import Typography from '@mui/material/Typography';
import Label from '@mui/material/FormLabel';
import { AztecContext, WebLogger } from '../../../aztecEnv';
import { convertFromUTF8BufferAsString } from '../../../utils/conversion';
import type { AccountType } from '../../../utils/storage';
import { sendCommandAndParseResponse, CommandType } from '@thunkar/aztec-keychain-accounts/webserial';

export function AddSendersDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (sender?: AztecAddress, alias?: string) => void;
}) {
  const { wallet, walletDB } = useContext(AztecContext);

  const [walletType, setWalletType] = useState<AccountType>();

  useEffect(() => {
    const checkType = async () => {
      const accountData = await walletDB.retrieveAccount(wallet.getAddress());
      const type = convertFromUTF8BufferAsString(accountData.type);
      setWalletType(type as AccountType);
    };
    if (wallet && walletDB) {
      checkType();
    }
  }, [wallet, walletDB]);

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

  const importFromKeychain = async () => {
    const response = await sendCommandAndParseResponse(
      { type: CommandType.GET_SENDER_REQUEST, data: {} },
      WebLogger.getInstance().createLogger('aztec-keychain'),
    );
    if (response.type === CommandType.GET_SENDER_RESPONSE) {
      const { sender } = response.data;
      setSender(sender);
    } else {
      setError('Invalid response from Aztec keychain');
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Add contact</DialogTitle>
      <DialogContent sx={dialogBody}>
        <DialogContentText>{INFO_TEXT.CONTACTS}</DialogContentText>
        {walletType === 'aztec-keychain' && (
          <Button
            sx={{ marginTop: '1rem' }}
            variant="contained"
            onClick={() => {
              importFromKeychain();
            }}
          >
            Import from Keychain
          </Button>
        )}
        <FormGroup css={form} sx={{ marginTop: '2rem' }}>
          <Label htmlFor="contact">Contact Address</Label>
          <TextField
            id="contact"
            required
            value={sender}
            placeholder="0x..."
            onChange={event => {
              setSender(event.target.value);
            }}
          />

          <Label htmlFor="alias">Alias</Label>
          <TextField
            id="alias"
            required
            value={alias}
            label="Alias"
            onChange={event => {
              setAlias(event.target.value);
            }}
          />
        </FormGroup>
        <InfoText>{INFO_TEXT.ALIASES}</InfoText>

        <Box sx={{ flexGrow: 1 }} />

        <DialogActions>
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
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
