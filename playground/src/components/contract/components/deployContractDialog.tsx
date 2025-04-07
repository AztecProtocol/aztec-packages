import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import { ContractDeployer, type ContractInstanceWithAddress, PublicKeys, SponsoredFeePaymentMethod } from '@aztec/aztec.js';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormGroup from '@mui/material/FormGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
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
import { FunctionParameter } from '../../common/fnParameter';

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
  const [localDeploying, setLocalDeploying] = useState(false);
  const { wallet, setLogsOpen, node, pxe, setIsWorking } = useContext(AztecContext);
  const [functionAbis, setFunctionAbis] = useState<FunctionAbi[]>([]);
  const [useSponsoredFees, setUseSponsoredFees] = useState(true);

  useEffect(() => {
    const defaultInitializer = getDefaultInitializer(contractArtifact);
    setInitializer(defaultInitializer);
    setFunctionAbis(getAllFunctionAbis(contractArtifact));
  }, [contractArtifact]);

  useEffect(() => {
    if (open) {
      // Override console.log to filter out block updates
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

  const handleParameterChange = (index, value) => {
    const newParameters = [...parameters];
    newParameters[index] = value;
    setParameters(newParameters);
  };

  const handleClose = () => {
    onClose();
  };

  const deploy = async () => {
    setLocalDeploying(true);
    setIsWorking(true); // Set global isWorking state to true

    // Close the dialog immediately so only the main modal shows
    onClose();

    try {
      // Register the contract class with PXE
      console.log('Registering contract class...');
      try {
        await wallet.registerContractClass(contractArtifact);
      } catch (error) {
        console.error('Contract class registration failed:', error);
        throw error;
      }

      // Create deployer instance
      console.log('Creating contract deployer...');
      let deployer;
      try {
        deployer = new ContractDeployer(contractArtifact, wallet, PublicKeys.default(), initializer?.name);
      } catch (error) {
        console.error('Contract deployer creation failed:', error);
        throw error;
      }

      // Encode arguments if needed
      let args = [];
      if (initializer && parameters.length > 0) {
        console.log('Encoding parameters for initializer:', initializer.name);
        console.log('Parameter types:', initializer.parameters.map(p => p.type));
        console.log('Parameter values:', parameters);

        try {
          args = encodeArguments(initializer, parameters);
          console.log('Encoded arguments:', args);
        } catch (error) {
          console.error('Error encoding parameters:', error);
          throw new Error(`Failed to encode parameters: ${error.message}`);
        }
      } else {
        console.log('No parameters to encode for initializer:', initializer?.name);
      }

      // Create deployment transaction
      console.log('Starting contract deployment...');
      const deployTx = deployer.deploy(...args);

      // Configure deployment options with fee payment method if using sponsored fees
      let deploymentOptions = {};
      if (useSponsoredFees) {
        try {
          const { prepareForFeePayment } = await import('../../../utils/fees');
          const sponsoredPaymentMethod = await prepareForFeePayment(pxe, wallet);
          deploymentOptions = {
            fee: {
              paymentMethod: sponsoredPaymentMethod
            }
          };
        } catch (feeError) {
          console.error('Sponsored fee setup error:', feeError);
        }
      }

      // Send transaction
      console.log('Sending deployment transaction...');
      const sentTx = await deployTx.send(deploymentOptions);

      // Wait for confirmation
      console.log('Waiting for deployment confirmation...');
      try {
        const deployed = await sentTx.wait();
        console.log('Contract deployed successfully:', deployed.address.toString());
        onClose(deployed, alias);
      } catch (waitError) {
        console.error('Deployment confirmation error:', waitError);

        // Handle SignerlessWallet errors
        if (waitError.message && waitError.message.includes('SignerlessWallet: Method getCompleteAddress not implemented')) {
          console.log('Contract might be deployed, but confirmation is unavailable due to wallet limitations');
          onClose();
        } else {
          throw waitError;
        }
      }
    } catch (error) {
      console.error('Deployment failed:', error);
      onClose();
    } finally {
      setLocalDeploying(false);
      setIsWorking(false); // Always set global isWorking state back to false
    }
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Deploy Contract</DialogTitle>
      <div css={creationForm}>
        <TextField
          value={alias}
          label="Alias"
          onChange={event => {
            setAlias(event.target.value);
          }}
        />
        {functionAbis.filter(fn => fn.isInitializer).length > 0 && (
          <Typography variant="subtitle1" style={{ marginTop: '16px', alignSelf: 'flex-start', fontWeight: 'bold' }}>
            Contract Initializer
          </Typography>
        )}
        {initializer && (
          <FormControl fullWidth>
            <InputLabel>Initializer</InputLabel>
            <Select
              value={initializer.name}
              label="Initializer"
              onChange={event => {
                setInitializer(
                  getInitializer(
                    contractArtifact,
                    event.target.value as string,
                  ),
                );
                // Reset parameters when changing initializer
                setParameters([]);
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
            <FormHelperText>
              Select the initializer function to use for deployment.
              <br /> A contract can only be initialized once.
            </FormHelperText>
          </FormControl>
        )}
        {initializer?.parameters && initializer.parameters.length > 0 && (
          <FormGroup row>
            {initializer.parameters.map((param, i) => (
              <FunctionParameter
                parameter={param}
                key={param.name}
                onParameterChange={value =>
                  handleParameterChange(i, value)
                }
              />
            ))}
          </FormGroup>
        )}

        <FormControl component="fieldset" sx={{ mt: 2 }}>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={useSponsoredFees}
                  onChange={(e) => setUseSponsoredFees(e.target.checked)}
                  name="useSponsoredFees"
                />
              }
              label="Use sponsored fees"
            />
          </FormGroup>
          <FormHelperText>Enable fee sponsorship for deployment</FormHelperText>
        </FormControl>

        <Button disabled={alias === ''} onClick={deploy}>
          Deploy
        </Button>
        <Button color="error" onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
