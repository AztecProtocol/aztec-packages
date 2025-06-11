import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { AuthWitness, ContractFunctionInteraction, type SendMethodOptions } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useContext, useEffect, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';
import FormControl from '@mui/material/FormControl';
import { FeePaymentSelector } from '../../common/FeePaymentSelector';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import { parseAliasedBuffersAsString } from '../../../utils/conversion';
import { dialogBody, form, progressIndicator } from '../../../styles/common';
import Divider from '@mui/material/Divider';
import { DialogContent } from '@mui/material';
import { Box, DialogActions } from '@mui/material';
import { INFO_TEXT } from '../../../constants';

interface ConfigureInteractionDialogProps {
  name: string;
  interaction: ContractFunctionInteraction;
  open: boolean;
  onClose: (name?: string, tx?: ContractFunctionInteraction, opts?: SendMethodOptions) => void;
}

export function ConfigureInteractionDialog({ name, interaction, open, onClose }: ConfigureInteractionDialogProps) {
  const [feePaymentMethod, setFeePaymentMethod] = useState(null);
  const [loading, setLoading] = useState(false);

  const [authWits, setAuthwits] = useState([]);
  const [selectedAuthwits, setSelectedAuthwits] = useState([]);

  const { walletDB } = useContext(AztecContext);

  useEffect(() => {
    const refreshAuthwits = async () => {
      setLoading(true);
      const authwitBuffers = await walletDB.listAliases('authwits');
      const authwits = parseAliasedBuffersAsString(authwitBuffers).map(({ key, value }) => ({
        key,
        value: AuthWitness.fromString(value),
      }));
      setAuthwits(authwits);
      setLoading(false);
    };
    refreshAuthwits();
  }, []);

  const send = async () => {
    onClose(name, interaction, { authWitnesses: selectedAuthwits, fee: { paymentMethod: feePaymentMethod } });
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Configure transaction</DialogTitle>

      <DialogContent sx={dialogBody}>
        <FormControl css={form}>
          <FeePaymentSelector setFeePaymentMethod={setFeePaymentMethod} />
        </FormControl>

        <Divider sx={{ margin: '1rem 0', width: '100%' }} />

        {loading ? (
          <div css={progressIndicator}>
            <Typography variant="body2" sx={{ mr: 1 }}>
              Loading authwits...
            </Typography>
            <CircularProgress size={20} />
          </div>
        ) : (
          <>
            <Typography variant="subtitle1" sx={{ alignSelf: 'flex-start', mb: 1 }}>
              Include autwitnesses
            </Typography>
            <Typography variant="caption">{INFO_TEXT.AUTHWITS}</Typography>

            <Autocomplete
              disablePortal
              multiple
              fullWidth
              loading={loading}
              sx={{ width: '100%', minWidth: '226px' }}
              options={authWits.map(alias => ({
                id: alias.key,
                label: alias.key,
                value: alias.value,
              }))}
              onChange={(_event, authwits) => setSelectedAuthwits(authwits.map(authwit => authwit.value))}
              renderInput={params => (
                <TextField {...params} variant="standard" label="Authwits" placeholder="Authwits" />
              )}
            />
          </>
        )}

        <Box sx={{ flexGrow: 1 }} />

        <DialogActions>
          <Button disabled={!feePaymentMethod} onClick={send}>
            Send
          </Button>
          <Button color="error" onClick={handleClose}>
            Cancel
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
