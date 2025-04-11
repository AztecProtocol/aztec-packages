import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import {
  type AbiType,
  AztecAddress,
  Contract,
  ContractFunctionInteraction,
  type SendMethodOptions,
  isAddressStruct,
} from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useContext, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';
import { FunctionParameter } from '../../common/FnParameter';
import { dialogBody, form, progressIndicator } from '../../../styles/common';
import { INFO_TEXT } from '../../../constants';
import { InfoText } from '../../common/InfoText';
import { FeePaymentSelector } from '../../common/FeePaymentSelector';
import { formatFrAsString } from '../../../utils/conversion';
import { css } from '@emotion/react';

const aztecAddressTypeLike: AbiType = {
  kind: 'struct',
  path: 'address::AztecAddress',
  fields: [{ name: 'inner', type: { kind: 'field' } }],
};

const fixedText = css({
  fontSize: '0.8rem',
  fontStyle: 'italic',
  color: 'rgba(0, 0, 0, 0.75)',
  fontWeight: 200,
  margin: 0,
  padding: 0,
});

const authwitData = css({
  fontSize: '1rem',
  fontWeight: 'bold',
  margin: 0,
});

const authwitContainer = css({
  display: 'flex',
  flexDirection: 'column',
});

interface CreateAuthwitDialogProps {
  open: boolean;
  contract: Contract;
  fnName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[];
  isPrivate: boolean;
  onClose: (isPublic?: boolean, interaction?: ContractFunctionInteraction, opts?: SendMethodOptions) => void;
}

export function CreateAuthwitDialog({ open, contract, fnName, args, isPrivate, onClose }: CreateAuthwitDialogProps) {
  const [alias, setAlias] = useState('');
  const [caller, setCaller] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const [feePaymentMethod, setFeePaymentMethod] = useState(null);

  const { wallet, walletDB } = useContext(AztecContext);

  const handleClose = () => {
    onClose();
  };

  const createAuthwit = async () => {
    setCreating(true);
    try {
      const action = contract.methods[fnName](...args);
      let witness;
      if (isPrivate) {
        witness = await wallet.createAuthWit({
          caller: AztecAddress.fromString(caller),
          action,
        });
        await walletDB.storeAuthwitness(witness, undefined, alias);
        onClose();
      } else {
        const validateActionInteraction = await wallet.setPublicAuthWit(
          { caller: AztecAddress.fromString(caller), action },
          true,
        );
        const opts: SendMethodOptions = { fee: { paymentMethod: feePaymentMethod } };
        onClose(true, validateActionInteraction, opts);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setAlias('');
      setCreating(false);
    }
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Create authwit</DialogTitle>
      <div css={dialogBody}>
        <FormGroup css={form}>
          <FunctionParameter
            required
            parameter={{
              name: 'caller',
              type: aztecAddressTypeLike,
              visibility: 'private',
            }}
            onParameterChange={setCaller}
          ></FunctionParameter>
          <div css={authwitContainer}>
            <Typography css={fixedText}>Allow </Typography>{' '}
            <Typography css={authwitData}>{caller !== '' ? formatFrAsString(caller) : '<caller>'}</Typography>
            <Typography css={fixedText}>to call</Typography>
            <Typography css={authwitData}>
              {fnName}(
              {args.map(arg => (arg.toString().length > 31 ? formatFrAsString(arg.toString()) : arg)).join(', ')})
            </Typography>
            <Typography css={fixedText}>on contract</Typography>
            <Typography css={authwitData}>
              {contract.artifact.name}@{formatFrAsString(contract.address.toString())}
            </Typography>
          </div>
          <InfoText>{INFO_TEXT.AUTHWITS}</InfoText>
          {isPrivate ? (
            <FormControl>
              <TextField
                required
                placeholder="Alias"
                value={alias}
                label="Alias"
                sx={{ marginTop: '1rem' }}
                onChange={event => {
                  setAlias(event.target.value);
                }}
              />
              <InfoText>{INFO_TEXT.ALIASES}</InfoText>
            </FormControl>
          ) : (
            <FeePaymentSelector setFeePaymentMethod={setFeePaymentMethod} />
          )}
        </FormGroup>
        <div css={{ flexGrow: 1, margin: 'auto' }}></div>
        {!error ? (
          creating ? (
            <div css={progressIndicator}>
              <Typography variant="body2" sx={{ mr: 1 }}>
                Creating authwitness...
              </Typography>
              <CircularProgress size={20} />
            </div>
          ) : (
            <Button disabled={alias === '' || creating} onClick={createAuthwit}>
              Create
            </Button>
          )
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
