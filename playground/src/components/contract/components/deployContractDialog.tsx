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
  const [deploying, setDeploying] = useState(false);
  const { wallet, setLogsOpen, node, pxe } = useContext(AztecContext);
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

    try {
      console.log('=== CONTRACT DEPLOYMENT STARTED ===');
      logDeployment(`Contract Name: ${contractArtifact.name}`);
      logDeployment(`Initializer: ${initializer?.name || 'No initializer'}`);
      logDeployment(`Parameters: ${JSON.stringify(parameters)}`);
      logDeployment(`Wallet Address: ${wallet?.getAddress().toString()}`);
      logDeployment(`Using Sponsored Fees: ${useSponsoredFees}`);

      // Add specific detection for SignerlessWallet issues
      const walletType = wallet.constructor.name;
      logDeployment(`Wallet Type: ${walletType}`);

      if (walletType.includes('Signerless') || walletType === 'EcdsaKAccountWallet') {
        logDeployment('⚠️ Warning: Using a wallet type that might not fully support deployment');
        logDeployment('⚠️ Will try to work around limitations if possible');
      }

      // Register the contract class with PXE
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

      // Configure deployment options with fee payment method if using sponsored fees
      let deploymentOptions = {};

      if (useSponsoredFees) {
        try {
          logDeployment('🔄 Setting up sponsored fee payment...');

          // Use the new combined function that handles all setup
          const { prepareForFeePayment } = await import('../../../utils/fees');
          
          try {
            // This function handles both class registration and contract registration
            const sponsoredPaymentMethod = await prepareForFeePayment(pxe, wallet, node);
            logDeployment(`✅ Sponsored payment method created and ready to use`);

            deploymentOptions = {
              fee: {
                paymentMethod: sponsoredPaymentMethod
              }
            };
            logDeployment('✅ Fee payment method configured');
          } catch (fpcError) {
            logDeployment(`⚠️ Error with sponsored fee setup: ${fpcError.message}`);
            console.error('Full error details:', fpcError);
            logDeployment('⚠️ Will continue without sponsored fees');
          }
        } catch (feeError) {
          logDeployment(`⚠️ Error setting up sponsored fees: ${feeError.message}`);
          console.error('Sponsored fee setup error details:', feeError);
          logDeployment('⚠️ Continuing with default fee payment');
        }
      }

      logDeployment('🔄 4/5: Sending deployment transaction to network...');
      const sentTx = await deployTx.send(deploymentOptions);
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

            // Special handling for SignerlessWallet errors
            if (waitError.message && waitError.message.includes('SignerlessWallet: Method getCompleteAddress not implemented')) {
              logDeployment('⚠️ SignerlessWallet error detected - this wallet type has limited capabilities');
              logDeployment('⚠️ Contract might be deployed successfully, but confirmation is unavailable');
              logDeployment('⚠️ Will attempt to retrieve deployed contract by address...');

              // Wait a bit to ensure the transaction is processed
              await new Promise(resolve => setTimeout(resolve, 5000));

              try {
                // Try to use transaction hash to find contract address (approach 1)
                const txHash = sentTx.hash;
                logDeployment(`⚠️ Transaction hash: ${txHash.toString()}`);

                // Fallback to checking recent contracts (approach 2)
                logDeployment('⚠️ Checking recent contracts...');
                // This would require additional code to check for recently deployed contracts

                logDeployment('⚠️ Unable to automatically confirm deployment due to wallet limitations');
                logDeployment('⚠️ Please try using the Register button to add your contract by address.');

                // Break out of the loop - we can't confirm with this wallet
                break;
              } catch (fallbackError) {
                logDeployment(`⚠️ Fallback resolution failed: ${fallbackError.message}`);
              }
            }

            // Check if it's a database error
            else if (waitError.message && (
                waitError.message.includes('IDBKeyRange') ||
                waitError.message.includes('IndexedDB') ||
                waitError.message.includes('DataError') ||
                waitError.message.includes('database')
            )) {
              logDeployment('⚠️ Database error detected during wait. Transaction may have been sent.');
              logDeployment('⚠️ Deployment might still succeed even with this error.');
              logDeployment('⚠️ If you do not see your contract, try using Register afterward.');
              break;
            }

            if (retryCount >= maxWaitRetries) {
              throw waitError;
            }

            // Wait an increasing amount of time before retrying
            const waitTime = Math.min(2000 * retryCount, 10000);
            logDeployment(`⚠️ Wait failed (attempt ${retryCount}/${maxWaitRetries}). Retrying in ${waitTime/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      } finally {
        clearInterval(progressIndicator);
      }

      if (deployed) {
        logDeployment('🎉 Contract deployment confirmed successfully!');
        logDeployment(`Contract address: ${deployed.address.toString()}`);
        onClose(deployed, alias);
      } else {
        logDeployment('⚠️ Contract deployment could not be confirmed. Check transactions panel for status.');
        onClose();
      }
    } catch (error) {
      console.error('=== DEPLOYMENT ERROR ===');
      console.error(error);

      // Show the error to the user
      alert(`Deployment failed: ${error.message}`);

      // Also log a summary of deployment messages to help debug the issue
      console.log('=== DEPLOYMENT LOG SUMMARY ===');
      deploymentStatusMessages.forEach(msg => console.log(msg));

      onClose();
    } finally {
      setDeploying(false);
    }
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Deploy Contract</DialogTitle>
      <div css={creationForm}>
        {deploying ? (
          <>
            <Typography>Deploying Contract...</Typography>
            <CircularProgress />
            <Typography variant="caption">
              This may take 20-30 seconds
            </Typography>
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
                  }}
                >
                  {functionAbis
                    .filter(fn => fn.name.startsWith('init'))
                    .map(fn => (
                      <MenuItem key={fn.name} value={fn.name}>
                        {fn.name}
                      </MenuItem>
                    ))}
                </Select>
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
          </>
        )}
      </div>
    </Dialog>
  );
}
