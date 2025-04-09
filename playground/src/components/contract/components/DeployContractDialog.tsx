import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { ContractDeployer, type ContractInstanceWithAddress, PublicKeys } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { css } from '@mui/styled-engine';
import { useContext, useEffect, useState } from 'react';
import {
  type ContractArtifact,
  encodeArguments,
  type FunctionAbi,
  getDefaultInitializer,
  getInitializer,
  getAllFunctionAbis,
} from '@aztec/stdlib/abi';
import { AztecContext } from '../../../aztecEnv';
import { FunctionParameter } from '../../common/FnParameter';

const creationForm = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1rem',
  alignItems: 'center',
});

export function DeployContractDialog({
  open,
  contractArtifact,
  onClose,
}: {
  open: boolean;
  contractArtifact: ContractArtifact;
  onClose: (contract?: ContractInstanceWithAddress, alias?: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [initializer, setInitializer] = useState<FunctionAbi>(null);
  const [parameters, setParameters] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const { wallet, setLogsOpen } = useContext(AztecContext);
  const [functionAbis, setFunctionAbis] = useState<FunctionAbi[]>([]);

  useEffect(() => {
    const defaultInitializer = getDefaultInitializer(contractArtifact);
    setInitializer(defaultInitializer);
    setFunctionAbis(getAllFunctionAbis(contractArtifact));
  }, [contractArtifact]);

  const handleParameterChange = (index, value) => {
    parameters[index] = value;
    setParameters(parameters);
  };

  const handleClose = () => {
    onClose();
  };

  const deploy = async () => {
    setDeploying(true);
    setLogsOpen(true);

    // TODO(#12081): Add contractArtifact.noirVersion and check here (via Noir.lock)?

    const deployer = new ContractDeployer(contractArtifact, wallet, PublicKeys.default(), initializer?.name);

    let args = [];

    if (initializer && parameters.length > 0) {
      args = encodeArguments(initializer, parameters);
    }

    const deployed = await deployer
      .deploy(...args)
      .send()
      .wait();

    onClose(deployed.contract.instance, alias);
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Deploy contract</DialogTitle>
      <div css={creationForm}>
        {deploying ? (
          <>
            <Typography>Deploying...</Typography>
            <CircularProgress />
          </>
        ) : (
          <>
            <FormGroup sx={{ display: 'flex' }}>
              <FormControl>
                <InputLabel>Initializer</InputLabel>
                <Select
                  value={initializer?.name ?? ''}
                  label="Initializer"
                  disabled={!functionAbis.some(fn => fn.isInitializer)}
                  onChange={e => {
                    setInitializer(getInitializer(contractArtifact, e.target.value));
                  }}
                >
                  {functionAbis
                    .filter(fn => fn.isInitializer)
                    .map(fn => (
                      <MenuItem key={fn.name} value={fn.name}>
                        {fn.name}
                      </MenuItem>
                    ))}
                </Select>
                {initializer &&
                  initializer.parameters.map((param, i) => (
                    <FunctionParameter
                      parameter={param}
                      key={param.name}
                      onParameterChange={newValue => {
                        handleParameterChange(i, newValue);
                      }}
                    />
                  ))}
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
            <Button disabled={alias === ''} onClick={deploy}>
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
