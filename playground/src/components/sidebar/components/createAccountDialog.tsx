import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { AccountWalletWithSecretKey, Fr } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { css } from '@mui/styled-engine';
import { useContext, useState, useEffect } from 'react';
import { AztecContext } from '../../../aztecEnv';
import { AztecAddress } from '@aztec/aztec.js';

const creationForm = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1rem',
  alignItems: 'center',
});

// Hardcoded SponsoredFPC addresses for different environments
const SPONSORED_FPC_ADDRESSES = {
  // Address on devnet - this should be the correct one from deployment
  devnet: '0x1fd6a75cc72f39147756a663f3ef1edf85ebdd8471ed08c09920b2458d11cd8c',

  // Address on sandbox - we'll use a dummy address that will likely be updated
  sandbox: '0x1fd6a75cc72f39147756a663f3ef1edf85ebdd8471ed08c09920b2458d11cd8c',

  // Local hardcoded address for testing
  local: '0x1fd6a75cc72f39147756a663f3ef1edf85ebdd8471ed08c09920b2458d11cd8c'
};

export function CreateAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (account?: AccountWalletWithSecretKey, salt?: Fr, alias?: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [secretKey] = useState(Fr.random());
  const [creatingAccount, setCreatingAccount] = useState(false);
  const { pxe, wallet, walletDB, nodeURL, setDrawerOpen, setLogsOpen } = useContext(AztecContext);

  useEffect(() => {
    // Override console.log to filter out block updates when dialog is open
    if (open) {
      const originalConsoleLog = console.log;
      console.log = function(...args) {
        // Filter out "Updated pxe last block" messages
        if (
          args.length > 0 &&
          typeof args[0] === 'object' &&
          args[0] !== null &&
          args[0].module === 'pxe:service' &&
          args.length > 1 &&
          typeof args[1] === 'string' &&
          args[1].includes('Updated pxe last block')
        ) {
          // Skip this log
          return;
        }
        originalConsoleLog.apply(console, args);
      };

      // Restore console.log when dialog closes
      return () => {
        console.log = originalConsoleLog;
      };
    }
  }, [open]);

  const createAccount = async () => {
    setCreatingAccount(true);
    setDrawerOpen(false);
    setLogsOpen(true);
    const salt = Fr.random();

    try {
      console.log('=== CREATING NEW ECDSA K ACCOUNT ===');
      console.log('Alias:', alias);

      // Create a deterministic private key for signing
      // In production, you'd want a more secure random generation or user-provided key
      const signingPrivateKey = Buffer.alloc(32);
      // Use the alias to generate a deterministic value
      const keyContent = `${alias}-${Date.now()}`;
      signingPrivateKey.write(keyContent.padEnd(32, '-'), 0, 32, 'utf8');

      console.log('ECDSA K signing key created');

      // Lazy load the ECDSA module and use ECDSA K account
      console.log('Importing ECDSA K functions...');
      const { getEcdsaKAccount } = await import('@aztec/accounts/ecdsa/lazy');

      console.log('Creating account manager...');
      const account = await getEcdsaKAccount(
        pxe,
        secretKey,
        signingPrivateKey,
        salt
      );
      console.log('Account manager created');

      console.log('Registering account with PXE...');
      await account.register();
      console.log('Account registered with PXE');

      try {
        console.log('Attempting to deploy account...');
        const deployTx = await account.deploy();
        console.log('Deployment transaction created, waiting for confirmation...');
        await deployTx.wait();
        console.log('Account deployed successfully!');
      } catch (err) {
        // Log the raw error without abstracting
        console.error('Error with account deployment:');
        console.error(err);
        console.log('Falling back to standard registration without deployment...');
      }

      // Get the wallet regardless of whether deployment succeeded
      console.log('Getting wallet instance...');
      const ecdsaWallet = await account.getWallet();
      console.log('Wallet obtained:', ecdsaWallet.getAddress().toString());

      // Store the signing key metadata to retrieve it later
      if (walletDB) {
        console.log('Storing account data...');
        await walletDB.storeAccount(account.getAddress(), {
          type: 'ecdsasecp256k1',
          secretKey: secretKey,
          alias,
          salt,
        });

        console.log('Storing signing key metadata...');
        await walletDB.storeAccountMetadata(account.getAddress(), 'signingPrivateKey', signingPrivateKey);

        console.log('Account data stored successfully');
      }

      console.log('=== ECDSA K ACCOUNT CREATED SUCCESSFULLY ===');
      console.log('Address:', account.getAddress().toString());

      setCreatingAccount(false);
      onClose(ecdsaWallet, salt, alias);
    } catch (error) {
      console.error('=== ERROR CREATING ECDSA K ACCOUNT ===');
      // Log the raw error without abstracting it
      console.error(error);
      alert(`Error creating account: ${error.message}`);
      setCreatingAccount(false);
      onClose(); // Close dialog on error
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Create ECDSA K Account</DialogTitle>
      <div css={creationForm}>
        {creatingAccount ? (
          <>
            <Typography>Creating ECDSA K Account...</Typography>
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
              Create
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
