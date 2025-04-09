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
import { deployAccountInSandbox } from '../../../utils/sandboxDeployment';

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
  networkDisconnected,
}: {
  open: boolean;
  onClose: (account?: AccountWalletWithSecretKey, salt?: Fr, alias?: string) => void;
  networkDisconnected?: boolean;
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
        originalConsoleLog.apply(console, args);
      };

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
      console.log(`Creating new account: ${alias}`);

      // Create a deterministic private key for signing
      const signingPrivateKey = Buffer.alloc(32);
      const keyContent = `${alias}-${Date.now()}`;
      signingPrivateKey.write(keyContent.padEnd(32, '-'), 0, 32, 'utf8');

      // Lazy load the ECDSA module and use ECDSA K account
      const { getEcdsaKAccount } = await import('@aztec/accounts/ecdsa/lazy');

      const account = await getEcdsaKAccount(
        pxe,
        secretKey,
        signingPrivateKey,
        salt
      );

      // Register account with PXE
      await account.register();

      // Get the wallet instance
      const accountWallet = await account.getWallet();

      // Check if we're in sandbox environment
      const isSandbox = typeof nodeURL === 'string' && nodeURL.includes('sandbox');

      let isDeployed = false;
      let deployError = null;

      try {
        if (isSandbox) {
          // Use sandbox-specific deployment
          try {
            const { feePaymentMethod } = await deployAccountInSandbox(pxe, secretKey, salt);
            const deployTx = await account.deploy({ fee: { paymentMethod: feePaymentMethod } });
            await deployTx.wait();
            isDeployed = true;
          } catch (sandboxErr) {
            console.error('Error with sandbox deployment:', sandboxErr);
            deployError = sandboxErr;

            // Check if it's a connection timeout error
            if (sandboxErr.message?.includes('UND_ERR_CONNECT_TIMEOUT') ||
                sandboxErr.message?.includes('Error 500 from server') ||
                sandboxErr.message?.includes('fetch failed')) {
              throw new Error('Unable to connect to sandbox server. Please check if the sandbox is running and try again.');
            }
            // Don't try fallback for sandbox as it won't work
          }
        } else {
          // Lazy load fee payment preparation only when needed
          const { prepareForFeePayment } = await import('../../../utils/fees');
          const sponsoredPaymentMethod = await prepareForFeePayment(pxe, accountWallet);

          // Attempt deployment
          const deployTx = await account.deploy({ fee: { paymentMethod: sponsoredPaymentMethod } });
          await deployTx.wait();
          isDeployed = true;
        }
      } catch (err) {
        console.error('Error with sponsored account deployment');
        deployError = err;

        if (!isSandbox) {
          try {
            // Try standard deployment as fallback (only for non-sandbox)
            const deployTx = await account.deploy();
            await deployTx.wait();
            isDeployed = true;
          } catch (fallbackErr) {
            console.error('Error with standard account deployment');
          }
        }
      }

      // Verify deployment status by checking contract metadata
      let verifiedDeploymentStatus = false;
      try {
        const metadata = await pxe.getContractMetadata(account.getAddress());
        verifiedDeploymentStatus = metadata.isContractPubliclyDeployed;
      } catch (e) {
        // If metadata check fails, deployment didn't complete
      }

      // Store account data regardless of deployment status
      if (walletDB) {
        await walletDB.storeAccount(account.getAddress(), {
          type: 'ecdsasecp256k1',
          secretKey: secretKey,
          alias,
          salt,
        });

        await walletDB.storeAccountMetadata(account.getAddress(), 'signingPrivateKey', signingPrivateKey);

        // Store deployment status based on verification, not attempts
        await walletDB.storeAccountMetadata(
          account.getAddress(),
          'deploymentStatus',
          Buffer.from(verifiedDeploymentStatus ? 'deployed' : 'registered')
        );
      }

      const ecdsaWallet = await account.getWallet();

      // Log only essential information
      console.log(`Account created with address: ${account.getAddress().toString()}`);
      console.log(`Deployment status: ${verifiedDeploymentStatus ? 'Deployed' : 'Registered only'}`);

      // If there was a deployment error but we're not showing it as successfully deployed
      if (deployError && !verifiedDeploymentStatus) {
        console.log('Note: Account is registered but not fully deployed. You can still use it for many operations.');
      }

      setCreatingAccount(false);
      onClose(ecdsaWallet, salt, alias);
    } catch (error) {
      console.error('Error creating account:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      alert(`Error creating account: ${errorMessage}`);
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
        {networkDisconnected ? (
          <>
            <Typography color="error">Network not connected</Typography>
            <Typography variant="body2">
              You need to connect to a network before creating an account.
            </Typography>
            <Button color="primary" onClick={handleClose}>
              Close
            </Button>
          </>
        ) : creatingAccount ? (
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
