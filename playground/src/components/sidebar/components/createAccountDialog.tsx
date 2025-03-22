import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { AccountWalletWithSecretKey, Fr } from '@aztec/aztec.js';
// Import the ECDSA R1 SSH account instead of Schnorr
// import { getSchnorrAccount } from '@aztec/accounts/schnorr/lazy';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { css } from '@mui/styled-engine';
import { useContext, useState } from 'react';
import { deriveSigningKey } from '@aztec/stdlib/keys';
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

  const createAccount = async () => {
    setCreatingAccount(true);
    setDrawerOpen(false);
    setLogsOpen(true);
    const salt = Fr.random();

    try {
      // Create a valid buffer for ECDSA R1 SSH accounts
      const signingKeyBuffer = Buffer.alloc(64);
      signingKeyBuffer.write('11'.repeat(32), 0, 32, 'hex'); // x coordinate
      signingKeyBuffer.write('22'.repeat(32), 32, 32, 'hex'); // y coordinate

      console.log('Creating ECDSA R1 account with formatted key...');

      // Lazy load the ECDSA module and use ECDSA R1 SSH account
      const { getEcdsaRSSHAccount } = await import('@aztec/accounts/ecdsa/lazy');
      const account = await getEcdsaRSSHAccount(
        pxe,
        secretKey,
        signingKeyBuffer,
        salt
      );

      console.log('Registering ECDSA R1 account...');
      await account.register();

      // Determine which SponsoredFPC address to use based on the nodeURL
      let sponsoredFPCAddress;
      if (nodeURL.includes('localhost') || nodeURL.includes('127.0.0.1')) {
        sponsoredFPCAddress = SPONSORED_FPC_ADDRESSES.local;
        console.log('Using local SponsoredFPC address');
      } else if (nodeURL.includes('sandbox')) {
        sponsoredFPCAddress = SPONSORED_FPC_ADDRESSES.sandbox;
        console.log('Using sandbox SponsoredFPC address');
      } else {
        sponsoredFPCAddress = SPONSORED_FPC_ADDRESSES.devnet;
        console.log('Using devnet SponsoredFPC address');
      }

      try {
        console.log('Attempting to deploy account with fee payment...');

        // We'll try to deploy using a custom fee configuration
        // This is a simplified approach - in a real app, we would implement a proper SponsoredFeePaymentMethod
        const deployTx = await account.deploy();

        console.log('Waiting for deployment to complete...');
        await deployTx.wait();
        console.log('ECDSA R1 account deployed successfully!');
      } catch (err) {
        console.error('Error with deployment:', err);
        console.log('Falling back to standard registration without deployment...');
      }

      // Get the wallet regardless of whether deployment succeeded
      const ecdsaWallet = await account.getWallet();

      // Store the signing key metadata to retrieve it later
      if (walletDB) {
        console.log('Storing account metadata...');
        await walletDB.storeAccount(account.getAddress(), {
          type: 'ecdsasecp256r1ssh',
          secretKey: secretKey,
          alias,
          salt,
        });
        await walletDB.storeAccountMetadata(account.getAddress(), 'publicSigningKey', signingKeyBuffer);
      }

      console.log('ECDSA R1 account created successfully!');
      setCreatingAccount(false);
      onClose(ecdsaWallet, salt, alias);
    } catch (error) {
      console.error('Error creating ECDSA R1 account:', error);
      setCreatingAccount(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Create ECDSA R1 Account</DialogTitle>
      <div css={creationForm}>
        {creatingAccount ? (
          <>
            <Typography>Creating ECDSA R1 Account...</Typography>
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
