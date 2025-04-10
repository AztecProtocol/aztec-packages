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

  const { wallet, node } = useContext(AztecContext);

  const handleClose = () => {
    onClose();
  };

  const register = async () => {
    setRegistering(true);

    // TODO(#12081): Add contractArtifact.noirVersion and check here (via Noir.lock)?

    const contractInstance = await node.getContract(AztecAddress.fromString(address));

    await wallet.registerContract({
      instance: contractInstance,
      artifact: contractArtifact,
    });

    const contract = await Contract.at(AztecAddress.fromString(address), contractArtifact, wallet);

    onClose(contract.instance, alias);
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
