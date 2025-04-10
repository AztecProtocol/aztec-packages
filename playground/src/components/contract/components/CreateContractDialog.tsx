import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import {
  type ContractInstanceWithAddress,
  PublicKeys,
  DeployMethod,
  getContractInstanceFromDeployParams,
  Contract,
  type DeployOptions,
  AztecAddress,
  type Wallet,
} from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import { useContext, useEffect, useState } from 'react';
import {
  type ContractArtifact,
  type FunctionAbi,
  getDefaultInitializer,
  getInitializer,
  getAllFunctionAbis,
} from '@aztec/stdlib/abi';
import { AztecContext } from '../../../aztecEnv';
import { FunctionParameter } from '../../common/FnParameter';
import { FeePaymentSelector } from '../../common/FeePaymentSelector';
import { dialogBody, form, progressIndicator } from '../../../styles/common';

export function CreateContractDialog({
  open,
  contractArtifact,
  onClose,
}: {
  open: boolean;
  contractArtifact: ContractArtifact;
  onClose: (
    contract?: ContractInstanceWithAddress,
    publiclyDeploy?: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) => void;
}) {
  const [alias, setAlias] = useState('');
  const [initializer, setInitializer] = useState<FunctionAbi>(null);
  const [parameters, setParameters] = useState([]);
  const { wallet, walletDB, pxe } = useContext(AztecContext);
  const [functionAbis, setFunctionAbis] = useState<FunctionAbi[]>([]);

  const [feePaymentMethod, setFeePaymentMethod] = useState(null);
  const [publiclyDeploy, setPubliclyDeploy] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState(null);

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

  const createContract = async () => {
    setIsRegistering(true);
    try {
      const contract = await getContractInstanceFromDeployParams(contractArtifact, {
        publicKeys: PublicKeys.default(),
        constructorArtifact: initializer,
        constructorArgs: parameters,
        deployer: wallet.getAddress(),
      });
      await pxe.registerContract({ instance: contract, artifact: contractArtifact });
      await walletDB.storeContract(contract.address, contractArtifact, undefined, alias);
      let deployMethod: DeployMethod;
      let opts: DeployOptions;
      if (publiclyDeploy) {
        const postDeployCtor = (address: AztecAddress, wallet: Wallet) =>
          Contract.at(address, contractArtifact, wallet);
        deployMethod = new DeployMethod(
          contract.publicKeys,
          wallet,
          contractArtifact,
          postDeployCtor,
          parameters,
          initializer.name,
        );
        opts = { fee: { paymentMethod: feePaymentMethod } };
        onClose(contract, publiclyDeploy, deployMethod, opts);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Create contract</DialogTitle>
      <div css={dialogBody}>
        <FormGroup css={form}>
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
          <FormControlLabel
            value={publiclyDeploy}
            control={<Checkbox checked={publiclyDeploy} onChange={event => setPubliclyDeploy(event.target.checked)} />}
            label="Deploy"
          />
          {publiclyDeploy && <FeePaymentSelector setFeePaymentMethod={setFeePaymentMethod} />}
        </FormGroup>
        <div css={{ flexGrow: 1, margin: 'auto' }}></div>
        {!error ? (
          isRegistering ? (
            <div css={progressIndicator}>
              <Typography variant="body2" sx={{ mr: 1 }}>
                Registering contract...
              </Typography>
              <CircularProgress size={20} />
            </div>
          ) : (
            <Button
              disabled={alias === '' || (publiclyDeploy && !feePaymentMethod) || isRegistering}
              onClick={createContract}
            >
              {publiclyDeploy ? 'Create and deploy' : 'Create'}
            </Button>
          )
        ) : (
          <Typography variant="body2" sx={{ mr: 1 }} color="warning.main">
            An error occurred: {error}
          </Typography>
        )}
        <Button color="error" onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
