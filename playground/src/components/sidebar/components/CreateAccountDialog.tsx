import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { Fr, DeployMethod, type DeployOptions, AccountWallet } from '@aztec/aztec.js';
import { getSchnorrAccount } from '@aztec/accounts/schnorr/lazy';
import { getEcdsaRAccount, getEcdsaKAccount } from '@aztec/accounts/ecdsa/lazy';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useContext, useState } from 'react';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { AztecContext } from '../../../aztecEnv';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import type { AccountType } from '../../../utils/storage';
import { randomBytes } from '@aztec/foundation/crypto';
import { FeePaymentSelector } from '../../common/FeePaymentSelector';
import CircularProgress from '@mui/material/CircularProgress';
import InputLabel from '@mui/material/InputLabel';
import Typography from '@mui/material/Typography';
import FormGroup from '@mui/material/FormGroup';
import { progressIndicator, dialogBody, form } from '../../../styles/common';
import { InfoText } from '../../common/InfoText';
import { INFO_TEXT } from '../../../constants';
import { Box, DialogContent } from '@mui/material';
import { DialogActions } from '@mui/material';

export function CreateAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (
    accountWallet?: AccountWallet,
    publiclyDeploy?: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) => void;
}) {
  const [alias, setAlias] = useState('');
  const [type, setType] = useState<AccountType>('ecdsasecp256r1');
  const [secretKey] = useState(Fr.random());
  const [publiclyDeploy, setPubliclyDeploy] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState(null);

  const [feePaymentMethod, setFeePaymentMethod] = useState(null);

  const { pxe, walletDB } = useContext(AztecContext);

  const createAccount = async () => {
    setIsRegistering(true);
    try {
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
      const accountWallet = await accountManager.getWallet();
      await accountManager.register();
      await walletDB.storeAccount(accountWallet.getAddress(), {
        type,
        secretKey: accountWallet.getSecretKey(),
        alias,
        salt,
        signingKey,
      });

      let deployMethod: DeployMethod;
      let opts: DeployOptions;
      if (publiclyDeploy) {
        deployMethod = await accountManager.getDeployMethod();
        opts = {
          contractAddressSalt: salt,
          fee: {
            paymentMethod: await accountManager.getSelfPaymentMethod(feePaymentMethod),
          },
          universalDeploy: true,
          skipClassPublication: true,
          skipInstancePublication: true,
        };
      }
      onClose(accountWallet, publiclyDeploy, deployMethod, opts);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Create account</DialogTitle>

      <DialogContent sx={dialogBody}>
        <FormGroup sx={form}>
          <FormControl>
            <InputLabel>Account type</InputLabel>
            <Select
              value={type}
              label="Account Type"
              fullWidth
              disabled={isRegistering}
              onChange={event => setType(event.target.value as AccountType)}
            >
              <MenuItem value="schnorr">Schnorr</MenuItem>
              <MenuItem value="ecdsasecp256r1">ECDSA R1 - Recommended</MenuItem>
              <MenuItem value="ecdsasecp256k1">ECDSA K1</MenuItem>
            </Select>
            <InfoText>{INFO_TEXT.ACCOUNT_ABSTRACTION}</InfoText>
          </FormControl>
          <FormControl>
            <TextField
              required
              value={alias}
              label="Alias"
              fullWidth
              disabled={isRegistering}
              onChange={event => {
                setAlias(event.target.value);
              }}
            />
            <InfoText>{INFO_TEXT.ALIASES}</InfoText>
          </FormControl>
          {/* Always deploy for now */}
          {/* <FormControl>
            <FormControlLabel
              value={publiclyDeploy}
              control={
                <Checkbox checked={publiclyDeploy} onChange={event => setPubliclyDeploy(event.target.checked)} />
              }
              label="Deploy"
            />
          </FormControl> */}
          {publiclyDeploy && <FeePaymentSelector setFeePaymentMethod={setFeePaymentMethod} />}
        </FormGroup>

        <Box sx={{ flexGrow: 1 }}></Box>

        <DialogActions>
          {!error ? (
            isRegistering ? (
              <div css={progressIndicator}>
                <Typography variant="body2" sx={{ mr: 1 }}>
                  Registering account...
                </Typography>
                <CircularProgress size={20} />
              </div>
            ) : (
              <Button
                disabled={alias === '' || (publiclyDeploy && !feePaymentMethod) || isRegistering}
                onClick={createAccount}
              >
                {publiclyDeploy ? 'Create and deploy' : 'Create'}
              </Button>
            )
          ) : (
            <Typography variant="body2" sx={{ mr: 1 }} color="warning.main">
              An error occurred: {error}
            </Typography>
          )}
          <Button color="error" onClick={handleClose} disabled={isRegistering}>
            Cancel
          </Button>
        </DialogActions>

      </DialogContent>
    </Dialog >
  );
}
