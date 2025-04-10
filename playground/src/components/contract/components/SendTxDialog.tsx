import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import {
  Fq,
  Fr,
  type FeePaymentMethod,
  AccountManager,
  ContractFunctionInteraction,
  type SendMethodOptions,
} from '@aztec/aztec.js';
import { getSchnorrAccount } from '@aztec/accounts/schnorr/lazy';
import { getEcdsaRAccount, getEcdsaKAccount } from '@aztec/accounts/ecdsa/lazy';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { css } from '@mui/styled-engine';
import { useContext, useState } from 'react';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { AztecContext } from '../../../aztecEnv';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import type { AccountType } from '../../../utils/storage';
import { randomBytes } from '@aztec/foundation/crypto';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { FeePaymentSelector } from '../../common/FeePaymentSelector';
import CircularProgress from '@mui/material/CircularProgress';
import InputLabel from '@mui/material/InputLabel';
import Typography from '@mui/material/Typography';

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

  const send = async () => {
    onClose(name, interaction, { fee: { paymentMethod: feePaymentMethod } });
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
