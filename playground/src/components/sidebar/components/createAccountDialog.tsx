import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { AccountWalletWithSecretKey, Fr, SponsoredFeePaymentMethod } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { css } from '@mui/styled-engine';
import { useContext, useState, useEffect } from 'react';
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
  const [creatingAccount, setCreatingAccount] = useState(false);
  const { pxe, wallet, walletDB, nodeURL, setDrawerOpen, setLogsOpen, node } = useContext(AztecContext);

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

      // Ensure SponsoredFPC contract is registered with the PXE
      console.log('Setting up sponsored fee payment...');

      // First, get the wallet instance from the account
      const accountWallet = await account.getWallet();

      // Use the new combined helper function for sponsored fee payments
      console.log('Preparing sponsored fee payment...');
      
      try {
        const { prepareForFeePayment } = await import('../../../utils/fees');
        
        // This handles registration and creation of the payment method
        const sponsoredPaymentMethod = await prepareForFeePayment(pxe, accountWallet, node);
        console.log('Sponsored fee payment method ready');

        console.log('Attempting to deploy account with sponsored fees...');
        const deployTx = await account.deploy({ fee: { paymentMethod: sponsoredPaymentMethod } });
        console.log('Deployment transaction created, waiting for confirmation...');
        await deployTx.wait();
        console.log('Account deployed successfully with sponsored fees!');
      } catch (err) {
        // Log the raw error without abstracting
        console.error('Error with sponsored account deployment:');
        console.error(err);
        console.log('Falling back to standard deployment without fee specification...');

        try {
          // Try a regular deployment without fee specification
          const deployTx = await account.deploy();
          console.log('Standard deployment transaction created, waiting for confirmation...');
          await deployTx.wait();
          console.log('Account deployed successfully with standard deployment!');
        } catch (fallbackErr) {
          console.error('Error with standard account deployment:');
          console.error(fallbackErr);
          console.log('Falling back to standard registration without deployment...');
        }
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
