import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { AccountWalletWithSecretKey, Fr } from '@aztec/aztec.js';
import { getSchnorrAccount } from '@aztec/accounts/schnorr/lazy';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { css } from '@mui/styled-engine';
import { useContext, useState } from 'react';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { AztecContext } from '../../../aztecEnv';

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
  onClose: (account?: AccountWalletWithSecretKey, salt?: Fr, alias?: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [secretKey] = useState(Fr.random());
  const [deployingAccount, setDeployingAccount] = useState(false);
  const { pxe, setDrawerOpen, setLogsOpen } = useContext(AztecContext);

  const createAccount = async () => {
    setDeployingAccount(true);
    setDrawerOpen(false);
    setLogsOpen(true);
    const salt = Fr.random();
    const account = await getSchnorrAccount(pxe, secretKey, deriveSigningKey(secretKey), salt);
    await account.deploy().wait();
    const wallet = await account.getWallet();
    setDeployingAccount(false);
    onClose(wallet, salt, alias);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Create account</DialogTitle>
      <div css={creationForm}>
        {deployingAccount ? (
          <>
            <Typography>Deploying...</Typography>
            <CircularProgress />
          </>
        ) : (
          <>
            <TextField
              value={alias}
              label="Alias"
              onChange={event => {
                setAlias(event.target.value);
              }}
            />
            <Button disabled={alias === ''} onClick={createAccount}>
              Deploy
            </Button>
            <Button color="error" onClick={handleClose}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
