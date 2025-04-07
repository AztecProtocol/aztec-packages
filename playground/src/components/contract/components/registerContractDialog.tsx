import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { Contract, AztecAddress, type ContractInstanceWithAddress, type ContractArtifact } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { css } from '@mui/styled-engine';
import { useContext, useState } from 'react';
import { AztecContext } from '../../../aztecEnv';

const creationForm = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1rem',
  alignItems: 'center',
});

export function RegisterContractDialog({
  open,
  contractArtifact,
  onClose,
}: {
  open: boolean;
  contractArtifact: ContractArtifact;
  onClose: (contract?: ContractInstanceWithAddress, alias?: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [address, setAddress] = useState('');
  const [registering, setRegistering] = useState(false);

  const { wallet, node, setIsWorking } = useContext(AztecContext);

  const handleClose = () => {
    onClose();
  };

  const register = async () => {
    setRegistering(true);
    setIsWorking(true);

    try {
      // First, register the contract class in the PXE to fix potential "No artifact found" errors
      console.log('Registering contract class with PXE...');
      await wallet.registerContractClass(contractArtifact);
      console.log('Contract class registered successfully');

      // TODO(#12081): Add contractArtifact.noirVersion and check here (via Noir.lock)?
      console.log('Getting contract instance from node...');
      const contractAddress = AztecAddress.fromString(address);
      const contractInstance = await node.getContract(contractAddress);

      if (!contractInstance) {
        throw new Error(`Contract not found at address: ${address}`);
      }

      console.log('Contract instance retrieved from node');
      console.log('Contract class ID:', contractInstance.currentContractClassId.toString());

      console.log('Registering contract with PXE...');
      await wallet.registerContract({
        instance: contractInstance,
        artifact: contractArtifact,
      });
      console.log('Contract registered with PXE successfully');

      console.log('Creating Contract instance...');
      const contract = await Contract.at(contractAddress, contractArtifact, wallet);
      console.log('Contract instance created successfully');

      onClose(contract.instance, alias);
    } catch (error) {
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);

      // Try to extract more information about the error
      if (error.cause) {
        console.error('Error cause:', error.cause);
      }

      // Show error in UI
      alert(`Contract registration failed: ${error.message}`);
    } finally {
      setRegistering(false);
      setIsWorking(false);
    }
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Register contract</DialogTitle>
      <div css={creationForm}>
        {registering ? (
          <>
            <Typography>Registering...</Typography>
            <CircularProgress />
          </>
        ) : (
          <>
            <FormGroup sx={{ display: 'flex' }}>
              <FormControl>
                <TextField
                  placeholder="Address"
                  value={address}
                  label="Address"
                  sx={{ marginTop: '1rem' }}
                  onChange={event => {
                    setAddress(event.target.value);
                  }}
                />
              </FormControl>
              <FormControl>
                <TextField
                  placeholder="Alias"
                  value={alias}
                  label="Alias"
                  sx={{ marginTop: '1rem' }}
                  onChange={event => {
                    setAlias(event.target.value);
                  }}
                />
              </FormControl>
            </FormGroup>
            <Button disabled={alias === ''} onClick={register}>
              Register
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
