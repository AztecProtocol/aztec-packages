import { Fr, GrumpkinScalar } from '@aztec/circuits.js';
import { sleep } from '@aztec/foundation/sleep';

import zip from 'lodash.zip';

import SchnorrAccountContractAbi from '../abis/schnorr_account_contract.json' assert { type: 'json' };
import { AccountWallet, AztecRPC, createAztecRpcClient, getSchnorrAccount } from '../index.js';

export const INITIAL_SANDBOX_ENCRYPTION_KEYS = [
  GrumpkinScalar.fromString('2153536ff6628eee01cf4024889ff977a18d9fa61d0e414422f7681cf085c281'),
  GrumpkinScalar.fromString('aebd1b4be76efa44f5ee655c20bf9ea60f7ae44b9a7fd1fd9f189c7a0b0cdae'),
  GrumpkinScalar.fromString('0f6addf0da06c33293df974a565b03d1ab096090d907d98055a8b7f4954e120c'),
];

export const INITIAL_SANDBOX_SIGNING_KEYS = INITIAL_SANDBOX_ENCRYPTION_KEYS;

export const INITIAL_SANDBOX_SALTS = [Fr.ZERO, Fr.ZERO, Fr.ZERO];

export const INITIAL_SANDBOX_ACCOUNT_CONTRACT_ABI = SchnorrAccountContractAbi;

export const { SANDBOX_URL = 'http://localhost:8080' } = process.env;

/**
 * Gets a collection of wallets for the Aztec accounts that are initially stored in the sandbox.
 * @param aztecRpc - An instance of the Aztec RPC interface.
 * @returns A set of AccountWallet implementations for each of the initial accounts.
 */
export function getSandboxAccountsWallets(aztecRpc: AztecRPC): Promise<AccountWallet[]> {
  return Promise.all(
    zip(INITIAL_SANDBOX_ENCRYPTION_KEYS, INITIAL_SANDBOX_SIGNING_KEYS, INITIAL_SANDBOX_SALTS).map(
      ([encryptionKey, signingKey, salt]) => getSchnorrAccount(aztecRpc, encryptionKey!, signingKey!, salt).getWallet(),
    ),
  );
}

/**
 * Deploys the initial set of schnorr signature accounts to the sandbox
 * @param aztecRpc - An instance of the Aztec RPC interface.
 * @returns The set of deployed Account objects and associated private encryption keys
 */
export async function deployInitialSandboxAccounts(aztecRpc: AztecRPC) {
  const accounts = INITIAL_SANDBOX_ENCRYPTION_KEYS.map((privateKey, i) => {
    const account = getSchnorrAccount(aztecRpc, privateKey, INITIAL_SANDBOX_SIGNING_KEYS[i], INITIAL_SANDBOX_SALTS[i]);
    return {
      account,
      privateKey,
    };
  });
  // Deploy all accounts in parallel
  await Promise.all(
    accounts.map(x => {
      return x.account.waitDeploy();
    }),
  );
  return accounts;
}

/**
 * Function to wait until the sandbox becomes ready for use.
 * @param rpc - The rpc client connected to the sandbox.
 */
export async function waitForSandbox(rpc?: AztecRPC) {
  rpc = rpc ?? createAztecRpcClient(SANDBOX_URL);
  while (true) {
    try {
      await rpc.getNodeInfo();
      break;
    } catch (err) {
      await sleep(1000);
    }
  }
}
