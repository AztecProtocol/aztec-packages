import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { Fq, Fr, type FeePaymentMethod, AccountManager } from '@aztec/aztec.js';
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
import { select } from '../styles';

const creationForm = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1rem',
  alignItems: 'center',
});

export function CreateAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (
    manager?: AccountManager,
    salt?: Fr,
    alias?: string,
    type?: AccountType,
    signingKey?: Fq | Buffer,
    publiclyDeploy?: boolean,
    feePaymentMethod?: FeePaymentMethod,
  ) => void;
}) {
  const [alias, setAlias] = useState('');
  const [type, setType] = useState<AccountType>('schnorr');
  const [secretKey] = useState(Fr.random());
  const [publiclyDeploy, setPubliclyDeploy] = useState(true);

  const [feePaymentMethod, setFeePaymentMethod] = useState(null);

  const { pxe } = useContext(AztecContext);

  const createAccount = async () => {
    const salt = Fr.random();
    let accountManager;
    let signingKey;
    switch (type) {
      case 'schnorr': {
        signingKey = deriveSigningKey(secretKey);
        accountManager = await getSchnorrAccount(pxe, secretKey, signingKey, salt);
        break;
      }
      case 'ecdsasecp256r1': {
        signingKey = randomBytes(32);
        accountManager = await getEcdsaRAccount(pxe, secretKey, signingKey, salt);
        break;
      }
      case 'ecdsasecp256k1': {
        signingKey = randomBytes(32);
        accountManager = await getEcdsaKAccount(pxe, secretKey, signingKey, salt);
        break;
      }
      default: {
        throw new Error('Unknown account type');
      }
    }
    onClose(accountManager, salt, alias, type, signingKey, publiclyDeploy, feePaymentMethod);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Create account</DialogTitle>
      <div css={creationForm}>
        <>
          <FormControl>
            <Select
              css={select}
              value={type ?? ''}
              label="Account type"
              fullWidth
              onChange={event => setType(event.target.value as AccountType)}
            >
              <MenuItem value="schnorr">Schnorr</MenuItem>
              <MenuItem value="ecdsasecp256r1">ECDSA R1</MenuItem>
              <MenuItem value="ecdsasecp256k1">ECDSA K1</MenuItem>
            </Select>
            <TextField
              value={alias}
              label="Alias"
              fullWidth
              onChange={event => {
                setAlias(event.target.value);
              }}
            />
            <FormControlLabel
              value={publiclyDeploy}
              control={
                <Checkbox checked={publiclyDeploy} onChange={event => setPubliclyDeploy(event.target.checked)} />
              }
              label="Deploy"
            />
          </FormControl>
          {publiclyDeploy && <FeePaymentSelector setFeePaymentMethod={setFeePaymentMethod} />}
          <Button disabled={alias === ''} onClick={createAccount}>
            {publiclyDeploy ? 'Create and deploy' : 'Create'}
          </Button>
          <Button color="error" onClick={handleClose}>
            Cancel
          </Button>
        </>
      </div>
    </Dialog>
  );
}
