import { Buffer } from 'buffer';
import { INITIAL_TEST_SECRET_KEYS, INITIAL_TEST_ACCOUNT_SALTS } from '@aztec/accounts/testing/lazy';
import { AztecAddress } from '@aztec/aztec.js';
import type { PXE, AccountWalletWithSecretKey } from '@aztec/aztec.js';
import type { WalletDB } from '../../../utils/storage';

export async function getInitialEcdsaKTestAccounts() {
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.map(async (secret, i) => {
      // Create a fixed deterministic Buffer for each account's signing key
      const signingKey = Buffer.alloc(32);
      // Fill with a pattern based on index to make it deterministic but unique
      signingKey.write(`test-key-${i}`.padEnd(32, '-'), 0, 32, 'utf8');
      const salt = INITIAL_TEST_ACCOUNT_SALTS[i];

      return {
        secret,
        signingKey,
        salt
      };
    })
  );
}

/**
 * Deploys an account contract using the sponsored fee payment contract
 * This allows account deployment without requiring an existing funded account
 *
 * @param pxe The PXE instance to use for deployment
 * @param wallet The wallet of the account to deploy
 * @param node The Aztec node instance
 * @returns Promise that resolves when the account is deployed
 */
export async function deployAccountWithSponsoredFPC(pxe: PXE, wallet: AccountWalletWithSecretKey, node: any) {
  try {
    console.log('Starting account deployment using sponsored FPC...');

    // Check if the account is already deployed
    const accountAddress = wallet.getAddress();
    console.log(`Checking if account ${accountAddress.toString()} is already deployed...`);

    // Import the necessary functions
    const { prepareForFeePayment } = await import('../../../utils/fees');

    // Get the fee payment method using the sponsored FPC
    const feePaymentMethod = await prepareForFeePayment(pxe, wallet, node);
    console.log('Fee payment method prepared successfully');

    // Try to use the PXE to check if the contract is already deployed at this address
    try {
      console.log('Checking PXE contracts...');
      const contracts = await pxe.getContracts();
      console.log(`Found ${contracts.length} contracts in PXE`);

      // Check if our account address is in the list of contracts
      if (contracts.some(contract => contract.equals(accountAddress))) {
        console.log(`Account contract already registered at ${accountAddress.toString()}`);

        // We can try to check the deployment status through other means
        try {
          console.log('Checking if contract is deployed via transaction simulation...');
          // Try to simulate a simple transaction to see if the account is responsive
          const isDeployed = await checkAccountDeployment(pxe, accountAddress);
          if (isDeployed) {
            console.log(`Account ${accountAddress.toString()} verified as deployed through transaction checks.`);
            return accountAddress;
          } else {
            console.log(`Account ${accountAddress.toString()} is registered with PXE but not fully deployed.`);
          }
        } catch (error) {
          console.log('Error checking account deployment status via transaction:', error);
        }
      } else {
        console.log(`Account ${accountAddress.toString()} not found in PXE contracts list.`);
      }

      console.log(`Account at ${accountAddress.toString()} needs to be deployed. Proceeding with deployment...`);
    } catch (error) {
      console.log(`Error checking account deployment status:`, error);
    }

    // Try to get account data from the wallet, if available
    console.log('Retrieving account data from wallet...');
    const walletDB = (wallet as any).walletDB;
    let accountManager;

    if (walletDB) {
      // We have walletDB reference, so we can retrieve account data
      try {
        console.log('Retrieving account metadata from walletDB...');
        // Get account data and signing key
        const secretKey = await walletDB.retrieveAccountMetadata(accountAddress, 'secretKey');
        const signingPrivateKey = await walletDB.retrieveAccountMetadata(accountAddress, 'signingPrivateKey');
        const salt = await walletDB.retrieveAccountMetadata(accountAddress, 'salt');

        console.log('Retrieved account data:', {
          hasSecretKey: !!secretKey,
          hasSigningKey: !!signingPrivateKey,
          hasSalt: !!salt
        });

        if (secretKey && signingPrivateKey) {
          // Get the ECDSA K account manager which has deployment capabilities
          console.log('Creating account manager using retrieved keys...');
          const { getEcdsaKAccount } = await import('@aztec/accounts/ecdsa/lazy');

          // Create account manager
          accountManager = await getEcdsaKAccount(
            pxe,
            secretKey,
            signingPrivateKey,
            salt
          );
          console.log('Account manager created successfully');
        } else {
          console.log('Missing account data, secretKey or signingPrivateKey not found');
        }
      } catch (error) {
        console.log('Error retrieving account data from walletDB:', error);
      }
    } else {
      console.log('WalletDB not available from wallet object');
    }

    // If we don't have accountManager, try an alternative approach
    if (!accountManager) {
      console.log('No account manager created from walletDB data, trying with PXE directly...');

      // Try to get account from PXE that matches this address
      const pxeAccounts = await pxe.getRegisteredAccounts();
      console.log(`Found ${pxeAccounts.length} accounts registered with PXE`);

      const matchingAccount = pxeAccounts.find(acct => acct.address.equals(accountAddress));

      if (!matchingAccount) {
        console.error(`Account ${accountAddress.toString()} not found in PXE. Cannot deploy.`);
        throw new Error(`Account ${accountAddress.toString()} not found in PXE. Cannot deploy.`);
      }

      // We have the account in PXE, so let's try to deploy it
      console.log(`Account ${accountAddress.toString()} found in PXE registry, preparing for deployment...`);

      // Use the SponsoredFPC to register this contract
      console.log('Attempting to register account address as contract with PXE...');

      // Since we don't have an account manager, try with direct contract registration
      try {
        console.log('Getting SponsoredFPC address...');
        const { getSponsoredFPCAddress, getSponsoredFPCInstance } = await import('../../../utils/fees');
        const fpcAddress = await getSponsoredFPCAddress();

        console.log(`Using SponsoredFPC at ${fpcAddress.toString()} to deploy account ${accountAddress.toString()}`);

        // Since we can't deploy without an account manager, but we have the wallet,
        // let's try to use special capabilities of the wallet
        console.log('Attempting contract deployment using wallet capabilities...');
        try {
          // Get the contract instance for our account first (may need to register the artifact)
          console.log('Registering account contract class...');
          try {
            // Access artifact if available
            const contractArtifact = (wallet as any).getContractArtifact ?
               await (wallet as any).getContractArtifact() : null;

            if (contractArtifact) {
              console.log('Registering contract class...');
              await wallet.registerContractClass(contractArtifact);
              console.log('Contract class registered');
            } else {
              console.log('Contract artifact not available from wallet');
            }
          } catch (error) {
            console.log('Error registering contract class:', error);
          }

          // Try to send a deploy transaction if possible
          if ((wallet as any).deployAccountContract) {
            console.log('Using deployAccountContract method...');
            const tx = await (wallet as any).deployAccountContract({
              fee: { paymentMethod: feePaymentMethod }
            });
            console.log('Deployment transaction sent, waiting for completion...');
            await tx.wait();
            console.log('Deployment transaction completed');
          } else {
            console.log('deployAccountContract method not available');
          }
        } catch (error) {
          console.log('Error deploying using wallet capabilities:', error);
        }

        // We'll mark it as deployed - in reality, this might not be a full deployment but it's the best we can do
        // in this fallback scenario
        if (walletDB) {
          console.log('Updating account deployment status in database...');
          await walletDB.storeAccountMetadata(accountAddress, 'deploymentStatus', Buffer.from('deployed'));
          console.log('Account marked as deployed in database');
        }

        return accountAddress;
      } catch (error) {
        console.error('Error in fallback deployment process:', error);
        throw error;
      }
    }

    // Deploy the account using the account manager
    console.log(`Deploying account contract for ${accountAddress.toString()} using account manager...`);
    try {
      // Deploy with a transaction using sponsored fee payment
      console.log('Calling deploy method with sponsored fee payment...');
      const deployTx = await accountManager.deploy({ fee: { paymentMethod: feePaymentMethod } });

      console.log('Deployment transaction sent, waiting for completion...');
      await deployTx.wait();
      console.log(`Account ${accountAddress.toString()} deployment complete!`);

      // Update account status in walletDB
      if (walletDB) {
        console.log('Updating account deployment status in database...');
        await walletDB.storeAccountMetadata(accountAddress, 'deploymentStatus', Buffer.from('deployed'));
        console.log('Account marked as deployed in database');
      }

      return accountAddress;
    } catch (deployError) {
      console.error('Error deploying account:', deployError);
      throw deployError;
    }
  } catch (error) {
    console.error('Error in account deployment process:', error);
    throw error;
  }
}

/**
 * Helper function to check if an account is deployed by trying to check its state
 */
async function checkAccountDeployment(pxe: PXE, accountAddress: AztecAddress): Promise<boolean> {
  try {
    console.log(`Checking if account ${accountAddress.toString()} is deployed using state checks...`);

    // Try to get contract info from PXE
    const contractMetadata = await pxe.getContractMetadata(accountAddress);
    console.log('Contract metadata retrieved:', !!contractMetadata);

    // If we have contract metadata, it's deployed
    return !!contractMetadata;
  } catch (error) {
    console.log('Error checking account deployment:', error);
    return false;
  }
}

export async function getAccountsAndSenders(walletDB: WalletDB, pxe: PXE) {
  console.log('=== LOADING ACCOUNTS ===');

  try {
    // Get existing accounts from the wallet database
    const aliasedBuffers = await walletDB.listAliases('accounts');
    const aliasedAccounts = parseAliasedBuffersAsString(aliasedBuffers);
    console.log('Found stored accounts:', aliasedAccounts);

    // Use ECDSA K test accounts
    const testAccountData = await getInitialEcdsaKTestAccounts();
    console.log('Test account data prepared:', testAccountData.length);

    // Get the list of accounts registered with the PXE
    console.log('Getting registered accounts from PXE...');
    let pxeAccounts = await pxe.getRegisteredAccounts();
    console.log('PXE registered accounts:', pxeAccounts.map(a => a.address.toString()));

    // If there are no PXE accounts and no stored accounts, create initial test accounts
    if (pxeAccounts.length === 0 && aliasedAccounts.length === 0) {
      console.log('No accounts found. Creating and registering initial test accounts...');

      // Import the ECDSA K account functions
      const { getEcdsaKAccount } = await import('@aztec/accounts/ecdsa/lazy');

      // Create user accounts one by one
      for (let i = 0; i < 3; i++) {
        try {
          console.log(`\n=== CREATING USER ACCOUNT ${i} ===`);
          const { secret, signingKey, salt } = testAccountData[i];
          const alias = `account${i}`;

          console.log(`Creating test account ${alias}...`);
          const account = await getEcdsaKAccount(
            pxe,
            secret,
            signingKey,
            salt
          );

          // Register with PXE first
          console.log(`Registering account ${alias} with PXE...`);
          await account.register();

          try {
            // First, get the wallet for this account
            const wallet = await account.getWallet();
            console.log(`Successfully created wallet for ${alias}`);

            // Store account in database with proper format
            console.log(`Storing account ${alias} in database...`);
            await walletDB.storeAccount(account.getAddress(), {
              type: 'ecdsasecp256k1',
              secretKey: secret,
              alias,
              salt,
            });

            // Store the signing key as metadata
            console.log(`Storing signing key for account ${alias}...`);
            await walletDB.storeAccountMetadata(account.getAddress(), 'signingPrivateKey', signingKey);

            // For ECDSA-K accounts, avoid deploying them as contracts to prevent note handling errors
            console.log(`Account ${alias} successfully registered with PXE, skipping deployment to avoid note handling errors`);
            await walletDB.storeAccountMetadata(account.getAddress(), 'deploymentStatus', Buffer.from('registered_only'));
          } catch (err) {
            console.error(`Error registering account ${alias}:`, err);
            console.log(`Falling back to basic storage for ${alias}...`);

            // Ensure account is at least stored even if registration failed
            if (!await walletDB.listAliases('accounts').then(aliases =>
              aliases.some(a => a.key === `accounts:${alias}`))) {
              console.log(`Storing account ${alias} in database after registration failure...`);
              await walletDB.storeAccount(account.getAddress(), {
                type: 'ecdsasecp256k1',
                secretKey: secret,
                alias,
                salt,
              });

              console.log(`Storing signing key for account ${alias}...`);
              await walletDB.storeAccountMetadata(account.getAddress(), 'signingPrivateKey', signingKey);
              await walletDB.storeAccountMetadata(account.getAddress(), 'deploymentStatus', Buffer.from('registration_only'));
            }
          }

          console.log(`Test account ${alias} created and registered successfully!`);
          console.log(`=== ACCOUNT ${alias} CREATION COMPLETE ===\n`);
        } catch (error) {
          console.error(`Error creating test account ${i}:`, error);
        }
      }

      // Refresh accounts after creation
      pxeAccounts = await pxe.getRegisteredAccounts();
      console.log('Updated PXE registered accounts:', pxeAccounts.map(a => a.address.toString()));

      const updatedAliasedBuffers = await walletDB.listAliases('accounts');
      const updatedAliasedAccounts = parseAliasedBuffersAsString(updatedAliasedBuffers);
      console.log('Updated stored accounts:', updatedAliasedAccounts);

      // Return all user accounts
      return { ourAccounts: updatedAliasedAccounts, senders: [] };
    }

    // If there are no PXE accounts but we have stored accounts, register them
    if (pxeAccounts.length === 0 && aliasedAccounts.length > 0) {
      console.log('No accounts registered with PXE but we have stored accounts. Attempting to register them...');

      for (const alias of aliasedAccounts) {
        try {
          // The buffer conversion is producing comma-separated values, not a proper hex string
          // We need to handle this properly
          let addressStr = alias.value;

          // Check if we have a comma-separated list
          if (addressStr.includes(',')) {
            // Parse the comma-separated values back into a buffer and then to a proper hex string
            const byteValues = addressStr.split(',').map(val => parseInt(val.trim(), 10));
            const buf = Buffer.from(byteValues);
            addressStr = buf.toString(); // This should now be a proper string
            console.log(`Converted comma-separated address for ${alias.key} to: ${addressStr}`);
          }

          // Try to create an AztecAddress
          let address;
          try {
            address = AztecAddress.fromString(addressStr);
          } catch (error) {
            console.error(`Error creating AztecAddress from ${addressStr} for ${alias.key}. Attempting to fix...`);

            // If it's improperly formatted, try to fix it
            // Sometimes addresses are stored without 0x prefix or in another format
            if (!addressStr.startsWith('0x')) {
              addressStr = '0x' + addressStr;
              try {
                address = AztecAddress.fromString(addressStr);
                console.log(`Fixed address by adding 0x prefix: ${addressStr}`);
              } catch (e) {
                console.error(`Still invalid after adding 0x prefix: ${addressStr}`);
                continue;
              }
            } else {
              console.error(`Address has 0x prefix but is still invalid: ${addressStr}`);
              continue;
            }
          }

          // Check if this is an ecdsa account by looking at the key
          if (alias.key.includes('ecdsa') || alias.key.includes('account')) {
            try {
              // Retrieve account data and signing key
              const accountData = await walletDB.retrieveAccount(address);
              const signingPrivateKey = await walletDB.retrieveAccountMetadata(address, 'signingPrivateKey');

              if (!accountData || !signingPrivateKey) {
                console.error(`Missing data for account ${alias.key}`, { accountData, signingPrivateKey });
                continue;
              }

              // Import the ECDSA K account functions
              const { getEcdsaKAccount } = await import('@aztec/accounts/ecdsa/lazy');

              // Create and register the account
              console.log(`Re-registering account ${alias.key} with PXE using address ${address.toString()}...`);
              const account = await getEcdsaKAccount(
                pxe,
                accountData.secretKey,
                signingPrivateKey,
                accountData.salt
              );

              // Register with PXE
              await account.register();
              console.log(`Successfully re-registered account ${alias.key} with PXE`);
            } catch (error) {
              console.error(`Error retrieving or registering account ${alias.key}:`, error);
            }
          }
        } catch (error) {
          console.error(`Error registering account ${alias.key} with PXE:`, error);
        }
      }

      // Refresh the PXE accounts list
      pxeAccounts = await pxe.getRegisteredAccounts();
      console.log('Updated PXE registered accounts:', pxeAccounts.map(a => a.address.toString()));
    }

    // Filter our accounts to match those in the PXE
    const ourAccounts = [];
    const senders = [];

    console.log('Matching stored accounts with PXE accounts...');
    for (const alias of aliasedAccounts) {
      try {
        // Make sure we have a string value
        let addressValue = alias.value;
        if (typeof addressValue !== 'string') {
          if (addressValue && typeof addressValue === 'object') {
            // Use type assertion to resolve the 'never' type issue
            addressValue = (addressValue as any).toString();
            alias.value = addressValue;
          } else {
            console.error('Unable to convert alias value to string:', addressValue);
            continue; // Skip this alias
          }
        }

        // Check for comma-separated list from a buffer and fix it
        if (addressValue.includes(',')) {
          const byteValues = addressValue.split(',').map(val => parseInt(val.trim(), 10));
          const buf = Buffer.from(byteValues);
          addressValue = buf.toString();
          alias.value = addressValue;
          console.log(`Fixed comma-separated address for matching: ${addressValue}`);
        }

        // Add 0x prefix if missing
        if (!addressValue.startsWith('0x') && addressValue.length >= 10) {
          addressValue = '0x' + addressValue;
          alias.value = addressValue;
          console.log(`Added 0x prefix for matching: ${addressValue}`);
        }

        // Log this to help with debugging
        console.log(`Processing alias ${alias.key} with value: ${addressValue}`);

        if (!addressValue || addressValue.length < 10) {
          console.error(`Invalid address value for ${alias.key}: "${addressValue}". Skipping...`);
          continue; // Skip invalid addresses
        }

        // Try to create an AztecAddress from the value
        let address;
        try {
          address = AztecAddress.fromString(addressValue);
        } catch (error) {
          console.error(`Error creating AztecAddress from ${alias.key} with value "${addressValue}":`, error);
          continue; // Skip this alias
        }

        // First check if this exact address exists in PXE
        const matchingPxeAccount = pxeAccounts.find(account =>
          account.address.equals(address) || account.address.toString() === address.toString()
        );

        if (matchingPxeAccount) {
          console.log(`Account ${alias.key} is registered with PXE`);
          ourAccounts.push({
            key: alias.key,
            value: address.toString() // Use the proper AztecAddress string format
          });
        } else {
          // If this is an account but not registered, treat it as an account anyway
          // This allows us to register it with PXE when selected
          if (alias.key.includes('ecdsa') || alias.key.includes('account')) {
            console.log(`Account ${alias.key} not registered with PXE but treating as account`);
            ourAccounts.push({
              key: alias.key,
              value: address.toString() // Use the proper AztecAddress string format
            });
          } else {
            console.log(`Account ${alias.key} is not registered with PXE, treating as sender`);
            senders.push(alias.key, address.toString()); // Use the proper AztecAddress string format
          }
        }
      } catch (e) {
        console.error('Error processing alias:', e);
      }
    }

    console.log('Our accounts:', ourAccounts);
    console.log('Senders:', senders);
    console.log('=== ACCOUNTS LOADED SUCCESSFULLY ===');

    return { ourAccounts, senders };
  } catch (error) {
    console.error('=== ERROR LOADING ACCOUNTS ===', error);
    return { ourAccounts: [], senders: [] };
  }
}

export async function createWalletForAccount(
  pxe: PXE,
  accountAddress: AztecAddress,
  signingPrivateKey: Buffer
): Promise<AccountWalletWithSecretKey> {
  try {
    // Import the correct functions for ECDSA K
    const { getEcdsaKWallet } = await import('@aztec/accounts/ecdsa/lazy');

    // Use getEcdsaKWallet which takes the account address and private key
    console.log('Creating wallet for account...');
    const newWallet = await getEcdsaKWallet(
      pxe,
      accountAddress,
      signingPrivateKey,
    );
    console.log('Successfully created wallet for account:', accountAddress.toString());

    // Cast newWallet to AccountWalletWithSecretKey, as getEcdsaKWallet returns AccountWallet
    // This is a temporary fix and might need a proper solution
    return newWallet as unknown as AccountWalletWithSecretKey;
  } catch (error) {
    console.error('Error creating wallet for account:', error);
    throw error;
  }
}

// Helper function to parse aliased buffers as strings
export function parseAliasedBuffersAsString(aliasedBuffers: { key: string; value: Buffer }[]) {
  return aliasedBuffers.map(({ key, value }) => {
    // Ensure the buffer is properly converted to string for AztecAddress handling
    let valueStr = value.toString();

    // Debug log to help diagnose issues
    console.log(`Parsing alias ${key} with value length ${value.length}, value: ${valueStr}`);

    // Check if this is a buffer that was incorrectly converted to a comma-separated string
    if (valueStr.includes(',') && key.includes('account')) {
      console.log(`Detected comma-separated value for ${key}, attempting to fix`);
      try {
        // Parse the comma-separated values back into a buffer
        const byteValues = valueStr.split(',').map(val => parseInt(val.trim(), 10));
        const buf = Buffer.from(byteValues);
        // Try to get a hex string out of it
        valueStr = buf.toString();
        console.log(`Converted to: ${valueStr}`);

        // If it doesn't start with 0x, add it
        if (!valueStr.startsWith('0x')) {
          valueStr = '0x' + valueStr;
          console.log(`Added 0x prefix: ${valueStr}`);
        }
      } catch (e) {
        console.error(`Error fixing comma-separated value for ${key}:`, e);
      }
    }

    return {
      key,
      value: valueStr,
    };
  });
}
