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
  const [deploying, setDeploying] = useState(false);
  const { wallet, setLogsOpen, node } = useContext(AztecContext);
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

    // Create a reference to store deployment status messages
    // for displaying at the end even if logs are filtered
    const deploymentStatusMessages = [];

    const logDeployment = (message) => {
      console.log(message);
      deploymentStatusMessages.push(message);
    };

    logDeployment('=== CONTRACT DEPLOYMENT STARTED ===');
    logDeployment(`Contract Name: ${contractArtifact.name}`);
    logDeployment(`Initializer: ${initializer?.name || 'No initializer'}`);
    logDeployment(`Parameters: ${JSON.stringify(parameters)}`);
    logDeployment(`Wallet Address: ${wallet?.getAddress().toString()}`);

    try {
      // First, register the contract class with PXE to fix the "No artifact found" error
      logDeployment('🔄 1/5: Registering contract class with PXE...');

      // Try registration with retries
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount <= maxRetries) {
        try {
          await wallet.registerContractClass(contractArtifact);
          logDeployment('✅ Contract class registered successfully');
          break;
        } catch (error) {
          retryCount++;
          if (retryCount > maxRetries) {
            throw error;
          }
          logDeployment(`⚠️ Registration attempt ${retryCount} failed, retrying...`);
          // Add a delay before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Give the PXE a moment to process the registration
      await new Promise(resolve => setTimeout(resolve, 2000));

      // TODO(#12081): Add contractArtifact.noirVersion and check here (via Noir.lock)?
      logDeployment('🔄 2/5: Creating ContractDeployer instance...');

      // Create the deployer with retries to handle potential timing issues
      let deployer;
      retryCount = 0;

      while (retryCount <= maxRetries) {
        try {
          deployer = new ContractDeployer(contractArtifact, wallet, PublicKeys.default(), initializer?.name);
          logDeployment('✅ ContractDeployer created successfully');
          break;
        } catch (error) {
          retryCount++;

          // Handle the specific "getValuesAsync" error
          if (error.message && error.message.includes("Cannot read properties of undefined (reading 'getValuesAsync')")) {
            logDeployment('⚠️ Encountered a timing issue with PXE. Waiting before retrying...');
            // This is likely a timing issue, wait a bit longer
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            // For other errors, wait a shorter time
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          if (retryCount > maxRetries) {
            throw error;
          }
          logDeployment(`⚠️ Deployer creation attempt ${retryCount} failed, retrying...`);
        }
      }

      let args = [];

      if (initializer && parameters.length > 0) {
        logDeployment('🔄 Encoding initializer arguments...');
        args = encodeArguments(initializer, parameters);
        logDeployment(`✅ Arguments encoded: ${args.length} arguments prepared`);
      }

      logDeployment('🔄 3/5: Starting contract deployment...');
      const deployTx = deployer.deploy(...args);
      logDeployment('✅ Deployment transaction created');

      logDeployment('🔄 4/5: Sending deployment transaction to network...');
      const sentTx = await deployTx.send();
      logDeployment('✅ Deployment transaction sent to network');
      logDeployment('⏱️ This step may take 20-30 seconds...');

      // Wait for confirmation, with retries and detailed status reporting
      logDeployment('🔄 5/5: Waiting for deployment confirmation...');
      let deployed;

      // Retry logic with max retry count
      const maxWaitRetries = 5; // Increased for wait operation
      let attempt = 0;
      let progressIndicator = setInterval(() => {
        logDeployment(`⏱️ Still waiting for confirmation... (${Math.min(++attempt * 5, 95)}% complete)`);
      }, 5000);

      try {
        retryCount = 0; // Reset retry count for this operation
        while (retryCount <= maxWaitRetries) {
          try {
            deployed = await sentTx.wait();
            break; // Success! Exit the loop
          } catch (waitError) {
            retryCount++;
            console.error(`Deployment confirmation error (attempt ${retryCount}/${maxWaitRetries}):`, waitError);

            // Check if it's a database error
            if (waitError.message && (
                waitError.message.includes('IDBKeyRange') ||
                waitError.message.includes('IndexedDB') ||
                waitError.message.includes('DataError') ||
                waitError.message.includes('getValuesAsync')
              )) {
              logDeployment('⚠️ Database error detected during deployment confirmation.');
              logDeployment('⚠️ This is likely a temporary IndexedDB issue.');
              logDeployment('⚠️ The contract might still be deployed successfully on the network,');
              logDeployment('⚠️ but we cannot confirm it due to database errors.');

              // For database errors, wait longer
              await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
              // For other errors, wait a standard time
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // If we've reached max retries, rethrow the error
            if (retryCount > maxWaitRetries) {
              // If we can't confirm due to database errors, we need to check if the deployment succeeded anyway
              if (waitError.message && (
                  waitError.message.includes('IDBKeyRange') ||
                  waitError.message.includes('IndexedDB') ||
                  waitError.message.includes('DataError') ||
                  waitError.message.includes('getValuesAsync')
                )) {
                logDeployment('⚠️ Could not confirm deployment due to database errors, but contract might be deployed.');
                logDeployment('⚠️ Please use the Reset DB button and reload the page.');
                logDeployment('⚠️ Then try to use the Register button to add your contract by address.');

                // Break out of the loop without rethrowing - consider this a "soft" failure
                break;
              }

              throw waitError;
            }

            // Otherwise wait a bit and try again
            logDeployment(`🔁 Retrying deployment confirmation... (${retryCount}/${maxWaitRetries})`);
          }
        }
      } finally {
        clearInterval(progressIndicator);
      }

      if (!deployed) {
        logDeployment('⚠️ Could not confirm deployment, but that doesn\'t mean it failed.');
        logDeployment('⚠️ Your contract might still be deployed on the network.');
        logDeployment('⚠️ Try using Reset DB button, reload the page, and register your contract.');

        // Create a softer error message for the UI since we don't know for sure if it failed
        alert('Could not confirm deployment due to database errors. Your contract might still be deployed. Try the Reset DB button, reload the page, and then use Register to find your contract.');
        setDeploying(false);
        return;
      }

      logDeployment('✅ DEPLOYMENT CONFIRMED!');
      logDeployment(`🎉 Contract deployed at address: ${deployed.contract.instance.address.toString()}`);
      logDeployment(`📝 Contract class ID: ${deployed.contract.instance.currentContractClassId.toString()}`);
      logDeployment('=== CONTRACT DEPLOYMENT COMPLETED SUCCESSFULLY ===');

      // Display a success alert with deployment information
      alert(`Contract Deployed Successfully!\nAddress: ${deployed.contract.instance.address.toString()}\n\nYou can now interact with your contract.`);

      onClose(deployed.contract.instance, alias);
    } catch (error) {
      logDeployment('❌ CONTRACT DEPLOYMENT FAILED ❌');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);

      // Try to extract more information about the error
      if (error.cause) {
        console.error('Error cause:', error.cause);
      }

      if (error.response) {
        console.error('Error response:', error.response);
      }

      // Show more specific error messages to the user
      let errorMsg = `Contract deployment failed: ${error.message}`;

      if (error.message && (
          error.message.includes('IDBKeyRange') ||
          error.message.includes('IndexedDB') ||
          error.message.includes('DataError') ||
          error.message.includes('getValuesAsync')
        )) {
        errorMsg = "Database error occurred during deployment. The contract might still be deployed. Try the 'Reset DB' button on the main screen, then reload the page.";
      }

      // Display deployment log messages to help debug
      console.log('Deployment log summary:');
      deploymentStatusMessages.forEach(msg => console.log(msg));

      // Show error in UI
      alert(errorMsg);
      setDeploying(false);
    }
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
