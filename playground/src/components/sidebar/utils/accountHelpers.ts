import { Buffer } from 'buffer';
import { INITIAL_TEST_SECRET_KEYS, INITIAL_TEST_ACCOUNT_SALTS } from '@aztec/accounts/testing/lazy';
import { AztecAddress } from '@aztec/aztec.js';
import type { PXE, AccountWalletWithSecretKey } from '@aztec/aztec.js';
import type { WalletDB } from '../../../utils/storage';

export async function getInitialEcdsaKTestAccounts() {
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.map(async (secret, i) => {
      const signingKey = Buffer.alloc(32);
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

export async function deployAccountWithSponsoredFPC(pxe: PXE, wallet: AccountWalletWithSecretKey, node: any, walletDB: WalletDB) {
  try {
    const accountAddress = wallet.getAddress();
    console.log(`Starting deployment process for account ${accountAddress.toString()}...`);

    // Check if the contract is already deployed
    try {
      console.log('Checking if account is already deployed...');
      const metadata = await pxe.getContractMetadata(accountAddress);
      if (metadata.isContractPubliclyDeployed) {
        console.log(`Account ${accountAddress.toString()} is already deployed.`);
        return accountAddress;
      }
      console.log('Account is not deployed yet, proceeding with deployment...');
    } catch (error) {
      console.log('Could not verify deployment status, proceeding with deployment:', error);
    }

    // Get account data from walletDB
    console.log('Retrieving account data from walletDB...');
    const accountData = await walletDB.retrieveAccount(accountAddress);
    if (!accountData) {
      throw new Error(`No account data found for ${accountAddress.toString()}`);
    }

    const secretKey = accountData.secretKey;
    const signingPrivateKey = await walletDB.retrieveAccountMetadata(accountAddress, 'signingPrivateKey');
    const salt = accountData.salt;

    if (!secretKey || !signingPrivateKey) {
      throw new Error('Missing required account data for deployment');
    }

    // Create account manager
    console.log('Creating account manager...');
    const { getEcdsaKAccount } = await import('@aztec/accounts/ecdsa/lazy');
    const accountManager = await getEcdsaKAccount(
      pxe,
      secretKey,
      signingPrivateKey,
      salt
    );
    console.log('Account manager created successfully');

    // Prepare fee payment method
    console.log('Preparing fee payment method...');
    const { prepareForFeePayment } = await import('../../../utils/fees');
    const feePaymentMethod = await prepareForFeePayment(pxe, wallet);
    console.log('Fee payment method prepared successfully');

    // Deploy the account
    console.log('Deploying account contract...');
    try {
      const deployTx = await accountManager.deploy({
        fee: { paymentMethod: feePaymentMethod }
      });
      console.log('Deployment transaction sent, waiting for confirmation...');
      await deployTx.wait();
      console.log('Deployment transaction confirmed');

      // Verify deployment status
      console.log('Verifying deployment status...');
      let isDeployed = false;
      try {
        const metadata = await pxe.getContractMetadata(accountAddress);
        isDeployed = metadata.isContractPubliclyDeployed;
        console.log(`Deployment verification: ${isDeployed ? 'successful' : 'failed'}`);
      } catch (e) {
        console.error('Error verifying deployment status:', e);
      }

      // Update deployment status in walletDB
      await walletDB.storeAccountMetadata(
        accountAddress,
        'deploymentStatus',
        Buffer.from(isDeployed ? 'deployed' : 'registered')
      );
      console.log(`Account marked as ${isDeployed ? 'deployed' : 'registered'} in database.`);

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
    // Try to get contract info from PXE
    const contractMetadata = await pxe.getContractMetadata(accountAddress);
    return contractMetadata.isContractPubliclyDeployed;
  } catch (error) {
    return false;
  }
}

export async function getAccountsAndSenders(walletDB: WalletDB, pxe: PXE) {

  try {
    const aliasedBuffers = await walletDB.listAliases('accounts');
    const aliasedAccounts = parseAliasedBuffersAsString(aliasedBuffers);

    const testAccountData = await getInitialEcdsaKTestAccounts();
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

            await walletDB.storeAccount(account.getAddress(), {
              type: 'ecdsasecp256k1',
              secretKey: secret,
              alias,
              salt,
            });

            await walletDB.storeAccountMetadata(account.getAddress(), 'signingPrivateKey', signingKey);

            // Store initial deployment status as registered
            await walletDB.storeAccountMetadata(account.getAddress(), 'deploymentStatus', Buffer.from('registered'));
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
          if (alias.key.includes('ecdsa') || alias.key.includes('account')) {
            console.log(`Account ${alias.key} not registered with PXE but treating as account`);
            ourAccounts.push({
              key: alias.key,
              value: address.toString() // Use the proper AztecAddress string format
            });
          } else {
            console.log(`Account ${alias.key} is not registered with PXE`);
            senders.push(alias.key, address.toString());
          }
        }
      } catch (e) {
        console.error('Error processing alias:', e);
      }
    }

    console.log('Our accounts:', ourAccounts);
    console.log('Senders:', senders);

    return { ourAccounts, senders };
  } catch (error) {
    console.error('Error loading accounts', error);
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

    if (valueStr.includes(',') && key.includes('account')) {
      try {
        // Parse the comma-separated values back into a buffer
        const byteValues = valueStr.split(',').map(val => parseInt(val.trim(), 10));
        const buf = Buffer.from(byteValues);
        valueStr = buf.toString();

        // If it doesn't start with 0x, add it
        if (!valueStr.startsWith('0x')) {
          valueStr = '0x' + valueStr;
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
