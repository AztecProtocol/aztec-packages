import { generatePublicKey } from '@aztec/aztec.js';
import { registerContractClass } from '@aztec/aztec.js/deployment';
import { DefaultMultiCallEntrypoint } from '@aztec/aztec.js/entrypoint';
import { type AccountWalletWithSecretKey, SignerlessWallet } from '@aztec/aztec.js/wallet';
import { type PXE } from '@aztec/circuit-types';
import { deriveMasterIncomingViewingSecretKey, deriveSigningKey } from '@aztec/circuits.js/keys';
import { Fr } from '@aztec/foundation/fields';

import { SchnorrAccountContractArtifact, getSchnorrAccount } from '../schnorr/index.js';

export const INITIAL_TEST_SECRET_KEYS = [
  Fr.fromHexString('2153536ff6628eee01cf4024889ff977a18d9fa61d0e414422f7681cf085c281'),
  Fr.fromHexString('aebd1b4be76efa44f5ee655c20bf9ea60f7ae44b9a7fd1fd9f189c7a0b0cdae'),
  Fr.fromHexString('0f6addf0da06c33293df974a565b03d1ab096090d907d98055a8b7f4954e120c'),
];

export const INITIAL_TEST_ENCRYPTION_KEYS = INITIAL_TEST_SECRET_KEYS.map(secretKey =>
  deriveMasterIncomingViewingSecretKey(secretKey),
);
// TODO(#5837): come up with a standard signing key derivation scheme instead of using ivsk_m as signing keys here
export const INITIAL_TEST_SIGNING_KEYS = INITIAL_TEST_ENCRYPTION_KEYS;

export const INITIAL_TEST_ACCOUNT_SALTS = [Fr.ZERO, Fr.ZERO, Fr.ZERO];

/**
 * Gets a collection of wallets for the Aztec accounts that are initially stored in the test environment.
 * @param pxe - PXE instance.
 * @returns A set of AccountWallet implementations for each of the initial accounts.
 */
export function getInitialTestAccountsWallets(pxe: PXE): Promise<AccountWalletWithSecretKey[]> {
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.map((encryptionKey, i) =>
      getSchnorrAccount(pxe, encryptionKey!, INITIAL_TEST_SIGNING_KEYS[i]!, INITIAL_TEST_ACCOUNT_SALTS[i]).getWallet(),
    ),
  );
}

/**
 * Queries a PXE for it's registered accounts and returns wallets for those accounts using keys in the initial test accounts.
 * @param pxe - PXE instance.
 * @returns A set of AccountWallet implementations for each of the initial accounts.
 */
export async function getDeployedTestAccountsWallets(pxe: PXE): Promise<AccountWalletWithSecretKey[]> {
  const registeredAccounts = await pxe.getRegisteredAccounts();
  return Promise.all(
    INITIAL_TEST_SECRET_KEYS.filter(initialSecretKey => {
      const initialEncryptionKey = deriveMasterIncomingViewingSecretKey(initialSecretKey);
      const publicKey = generatePublicKey(initialEncryptionKey);
      return (
        registeredAccounts.find(registered => registered.publicKeys.masterIncomingViewingPublicKey.equals(publicKey)) !=
        undefined
      );
    }).map(secretKey => {
      const signingKey = deriveSigningKey(secretKey);
      // TODO(#5726): use actual salt here instead of hardcoding Fr.ZERO
      return getSchnorrAccount(pxe, secretKey, signingKey, Fr.ZERO).getWallet();
    }),
  );
}

/**
 * Deploys the initial set of schnorr signature accounts to the test environment
 * @param pxe - PXE instance.
 * @returns The set of deployed Account objects and associated private encryption keys
 */
export async function deployInitialTestAccounts(pxe: PXE) {
  const accounts = INITIAL_TEST_SECRET_KEYS.map((secretKey, i) => {
    const account = getSchnorrAccount(pxe, secretKey, INITIAL_TEST_SIGNING_KEYS[i], INITIAL_TEST_ACCOUNT_SALTS[i]);
    return {
      account,
      secretKey,
    };
  });
  // Register contract class to avoid duplicate nullifier errors
  const { l1ChainId: chainId, protocolVersion } = await pxe.getNodeInfo();
  const deployWallet = new SignerlessWallet(pxe, new DefaultMultiCallEntrypoint(chainId, protocolVersion));
  await (await registerContractClass(deployWallet, SchnorrAccountContractArtifact)).send().wait();
  // Attempt to get as much parallelism as possible
  const deployTxs = await Promise.all(
    accounts.map(async x => {
      const deployMethod = await x.account.getDeployMethod();
      const tx = await deployMethod.prove({
        contractAddressSalt: x.account.salt,
        universalDeploy: true,
      });
      return tx;
    }),
  );
  // Send tx together to try and get them in the same rollup
  const sentTxs = deployTxs.map(tx => {
    return tx.send();
  });
  await Promise.all(
    sentTxs.map(tx => {
      return tx.wait();
    }),
  );
  return accounts;
}
