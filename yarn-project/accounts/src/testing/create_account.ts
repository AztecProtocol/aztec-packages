import { type WaitOpts } from '@aztec/aztec.js';
import { type AccountWalletWithSecretKey } from '@aztec/aztec.js/wallet';
import { type PXE } from '@aztec/circuit-types';
import { Fr, deriveSigningKey } from '@aztec/circuits.js';

import { getSchnorrAccount } from '../schnorr/index.js';

/**
 * Deploys and registers a new account using random private keys and returns the associated Schnorr account wallet. Useful for testing.
 * @param pxe - PXE.
 * @returns - A wallet for a fresh account.
 */
export function createAccount(pxe: PXE): Promise<AccountWalletWithSecretKey> {
  let account;
  do {
    const secretKey = Fr.random();
    const signingKey = deriveSigningKey(secretKey);
    try {
      const potentialAccount = getSchnorrAccount(pxe, secretKey, signingKey);
      potentialAccount.getCompleteAddress();
      account = potentialAccount;
    } catch (err) {
      console.log(err);
    }
  } while (account === undefined);
  return account.waitSetup();
}

/**
 * Creates a given number of random accounts using the Schnorr account wallet.
 * @param pxe - PXE.
 * @param numberOfAccounts - How many accounts to create.
 * @param secrets - Optional array of secrets to use for the accounts. If empty, random secrets will be generated.
 * @throws If the secrets array is not empty and does not have the same length as the number of accounts.
 * @returns The created account wallets.
 */
export async function createAccounts(
  pxe: PXE,
  numberOfAccounts = 1,
  secretsAndSalts: [Fr, Fr][] = [],
  waitOpts: WaitOpts = { interval: 0.1 },
): Promise<AccountWalletWithSecretKey[]> {
  const confirmedSecretsAndSalts: [Fr, Fr][] = [];

  if (secretsAndSalts.length == 0) {
    confirmedSecretsAndSalts.push(...Array.from({ length: numberOfAccounts }, () => {
      let secretAndSalt: [Fr, Fr] = [Fr.ZERO, Fr.ZERO];
      do {
        const secretKey = Fr.random();
        const signingKey = deriveSigningKey(secretKey);
        try {
          const potentialAccount = getSchnorrAccount(pxe, secretKey, signingKey);
          potentialAccount.getCompleteAddress();
          secretAndSalt = [secretKey, potentialAccount.getInstance().salt];
        } catch (err) {
          console.log(err);
        }
      } while (secretAndSalt[0] === Fr.ZERO);

      return secretAndSalt;
    }));
  } else if (secretsAndSalts.length > 0 && secretsAndSalts.length !== numberOfAccounts) {
    throw new Error('Secrets array must be empty or have the same length as the number of accounts');
  }

  // Prepare deployments
  const accountsAndDeployments = await Promise.all(
    secretsAndSalts.map(async ([secret, salt])  => {
      const signingKey = deriveSigningKey(secret);
      const account = getSchnorrAccount(pxe, secret, signingKey, salt);
      const deployMethod = await account.getDeployMethod();
      const provenTx = await deployMethod.prove({
        contractAddressSalt: account.salt,
        skipClassRegistration: true,
        skipPublicDeployment: true,
        universalDeploy: true,
      });
      return { account, provenTx };
    }),
  );

  // Send them and await them to be mined
  await Promise.all(accountsAndDeployments.map(({ provenTx }) => provenTx.send().wait(waitOpts)));
  return Promise.all(accountsAndDeployments.map(({ account }) => account.getWallet()));
}
