import { AztecRPC } from '@aztec/aztec-rpc';
import { AztecAddress, Point } from '@aztec/circuits.js';
import { SentTx } from '../index.js';

/**
 * Creates an Aztec Account.
 * @returns The account's address & public key.
 */
export async function createAccount(aztecRpcClient: AztecRPC, privKey: Buffer): Promise<[AztecAddress, Point]> {
  const [txHash, newAddress] = await aztecRpcClient.createSmartAccount(privKey);
  // wait for tx to get mined
  await new SentTx(aztecRpcClient, Promise.resolve(txHash)).isMined();
  const pubKey = await aztecRpcClient.getAccountPublicKey(newAddress);
  return [newAddress, pubKey];
}
