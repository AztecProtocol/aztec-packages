import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import {
  type ContractInstanceWithAddress,
  PublicKeys,
  DeployMethod,
  getContractInstanceFromInstantiationParams,
  Contract,
  type DeployOptions,
  AztecAddress,
  type Wallet,
  Fr,
} from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { useContext, useEffect, useState } from 'react';
import {
  type ContractArtifact,
  type FunctionAbi,
  getDefaultInitializer,
  getInitializer,
  getAllFunctionAbis,
  isAddressStruct,
} from '@aztec/stdlib/abi';
import { AztecContext } from '../../../aztecEnv';
import { FunctionParameter } from '../../common/FnParameter';
import { FeePaymentSelector } from '../../common/FeePaymentSelector';
import { dialogBody, form, progressIndicator } from '../../../styles/common';
import { InfoText } from '../../common/InfoText';
import { INFO_TEXT } from '../../../constants';
import { DialogActions, DialogContent } from '@mui/material';

export function CreateContractDialog({
  open,
  contractArtifact,
  onClose,
  defaultContractCreationParams,
}: {
  open: boolean;
  contractArtifact: ContractArtifact;
  onClose: (
    contract?: ContractInstanceWithAddress,
    publiclyDeploy?: boolean,
    interaction?: DeployMethod,
    opts?: DeployOptions,
  ) => void;
  defaultContractCreationParams?: Record<string, unknown>;
}) {
  const [alias, setAlias] = useState(defaultContractCreationParams['alias'] as string);
  const [initializer, setInitializer] = useState<FunctionAbi>(null);
  const [parameters, setParameters] = useState([]);
  const { wallet, walletDB, pxe, node } = useContext(AztecContext);
  const [functionAbis, setFunctionAbis] = useState<FunctionAbi[]>([]);

  const [registerExisting, setRegisterExisting] = useState(false);
  const [address, setAddress] = useState('');

  const [feePaymentMethod, setFeePaymentMethod] = useState(null);
  const [publiclyDeploy, setPubliclyDeploy] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const defaultInitializer = getDefaultInitializer(contractArtifact);
    setInitializer(defaultInitializer);
    setFunctionAbis(getAllFunctionAbis(contractArtifact));
  }, [contractArtifact]);

  useEffect(() => {
    if (initializer && defaultContractCreationParams) {
      initializer.parameters.map((param, i) => {
        let value = defaultContractCreationParams[param.name];
        if (isAddressStruct(param.type)) {
          value = (value as { id: string })?.id;
        }
        handleParameterChange(i, value);
      });
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [defaultContractCreationParams, initializer]);

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
      const salt = Fr.random();
      const contract = await getContractInstanceFromInstantiationParams(contractArtifact, {
        publicKeys: PublicKeys.default(),
        constructorArtifact: initializer,
        constructorArgs: parameters,
        deployer: wallet.getAddress(),
        salt,
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
          initializer?.name,
        );
        opts = {
          contractAddressSalt: salt,
          fee: { paymentMethod: feePaymentMethod },
        };
        onClose(contract, publiclyDeploy, deployMethod, opts);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const registerExistingContract = async () => {
    setIsRegistering(true);
    try {
      const contract = await node.getContract(AztecAddress.fromString(address));
      if (!contract) {
        throw new Error('Contract with this address was not found in node');
      }
      await walletDB.storeContract(contract.address, contractArtifact, undefined, alias);
      onClose(contract);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Create contract</DialogTitle>

      <div css={{ display: 'flex', padding: '1rem', flexDirection: 'column' }}>
        <FormControlLabel
          control={<Switch value={registerExisting} onChange={(_event, checked) => setRegisterExisting(checked)} />}
          label={'Load an already deployed version of this contract'}
        />
        <InfoText>{INFO_TEXT.CREATE_CONTRACT}</InfoText>
      </div>

      <DialogContent sx={dialogBody}>
        <FormGroup css={form}>
          {registerExisting ? (
            <TextField
              required
              fullWidth
              variant="outlined"
              type="text"
              label="Address"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          ) : (
            <>
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
                      defaultValue={defaultContractCreationParams?.[param.name]}
                      onParameterChange={newValue => {
                        handleParameterChange(i, newValue);
                      }}
                    />
                  ))}
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
            </>
          )}
          <FormControl>
            <TextField
              placeholder="Alias"
              value={alias}
              label="Alias"
              size="small"
              sx={{ marginTop: '1rem' }}
              onChange={event => {
                setAlias(event.target.value);
              }}
            />
            <InfoText>{INFO_TEXT.ALIASES}</InfoText>
          </FormControl>
        </FormGroup>

        <DialogActions>
          {!error ? (
            isRegistering ? (
              <div css={progressIndicator}>
                <Typography variant="body2" sx={{ mr: 1 }}>
                  Registering contract...
                </Typography>
                <CircularProgress size={20} />
              </div>
            ) : registerExisting ? (
              <Button disabled={alias === '' || address === '' || isRegistering} onClick={registerExistingContract}>
                Register
              </Button>
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
        </DialogActions>

      </DialogContent>
    </Dialog>
  );
}
