import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { AuthWitness, ContractFunctionInteraction, type SendMethodOptions } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { css } from '@mui/styled-engine';
import { useContext, useEffect, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';
import FormControl from '@mui/material/FormControl';
import { FeePaymentSelector } from '../../common/FeePaymentSelector';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import { parseAliasedBuffersAsString } from '../../../utils/conversion';
import { progressIndicator } from '../../../styles/common';
import Divider from '@mui/material/Divider';

const dialogBody = css({
  display: 'flex',
  flexDirection: 'column',
  padding: '1rem',
  alignItems: 'center',
  minWidth: '350px',
  minHeight: '500px',
});

const form = css({
  width: '100%',
  display: 'flex',
  gap: '1rem',
});

interface SendTxDialogProps {
  name: string;
  interaction: ContractFunctionInteraction;
  open: boolean;
  onClose: (name?: string, tx?: ContractFunctionInteraction, opts?: SendMethodOptions) => void;
}

export function SendTxDialog({ name, interaction, open, onClose }: SendTxDialogProps) {
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
    console.log('Selected authwits:', selectedAuthwits);
    onClose(name, interaction, { authWitnesses: selectedAuthwits, fee: { paymentMethod: feePaymentMethod } });
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Send transaction</DialogTitle>
      <div css={dialogBody}>
        <FormControl css={form}>
          <FeePaymentSelector setFeePaymentMethod={setFeePaymentMethod} />
        </FormControl>
        <Divider sx={{ marginBottom: '0.5rem', width: '100%' }} />
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
        <div css={{ flexGrow: 1, margin: 'auto' }}></div>
        <Button disabled={!feePaymentMethod} onClick={send}>
          Send
        </Button>
        <Button color="error" onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
