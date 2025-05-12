import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { Fr, DeployMethod, type DeployOptions, AccountWallet, Fq, AccountManager } from '@aztec/aztec.js';
import { getSchnorrAccount } from '@aztec/accounts/schnorr/lazy';
import { getEcdsaRAccount, getEcdsaKAccount } from '@aztec/accounts/ecdsa/lazy';
import { getEcdsaRSerialAccount } from '@thunkar/aztec-keychain-accounts/ecdsa';
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
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState(null);

  const [feePaymentMethod, setFeePaymentMethod] = useState(null);

  const { pxe, walletDB } = useContext(AztecContext);

  const createAccount = async () => {
    setIsRegistering(true);
    try {
      let accountManager: AccountManager;
      let secretKey: Fr | undefined;
      let signingKey: Fq | Buffer | undefined;
      switch (type) {
        case 'schnorr': {
          secretKey = Fr.random();
          signingKey = deriveSigningKey(secretKey);
          accountManager = await getSchnorrAccount(pxe, secretKey, signingKey);
          break;
        }
        case 'ecdsasecp256r1': {
          secretKey = Fr.random();
          signingKey = randomBytes(32);
          accountManager = await getEcdsaRAccount(pxe, secretKey, signingKey);
          break;
        }
        case 'ecdsasecp256k1': {
          secretKey = Fr.random();
          signingKey = randomBytes(32);
          accountManager = await getEcdsaKAccount(pxe, secretKey, signingKey);
          break;
        }
        case 'aztec-keychain': {
          let index;
          ({ manager: accountManager, index } = await getEcdsaRSerialAccount(pxe));
          signingKey = Buffer.from([index]);
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
        salt: accountManager.getInstance().salt,
        signingKey,
      });

      const { isContractInitialized } = await pxe.getContractMetadata(accountWallet.getAddress());

      if (isContractInitialized) {
        onClose(accountWallet, false);
        return;
      }

      let deployMethod: DeployMethod;
      let opts: DeployOptions;
      deployMethod = await accountManager.getDeployMethod();
      opts = {
        contractAddressSalt: accountManager.getInstance().salt,
        fee: {
          paymentMethod: await accountManager.getSelfPaymentMethod(feePaymentMethod),
        },
        universalDeploy: true,
        skipClassRegistration: true,
        skipPublicDeployment: true,
      };

      onClose(accountWallet, true, deployMethod, opts);
    } catch (e) {
      console.error(e);
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
              <MenuItem value="aztec-keychain">Aztec Keychain (ECDSA R1)</MenuItem>
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
          <FeePaymentSelector setFeePaymentMethod={setFeePaymentMethod} />
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
              <Button disabled={alias === '' || !feePaymentMethod || isRegistering} onClick={createAccount}>
                Create and initialize
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
    </Dialog>
  );
}
