import { BlockAttestation } from '@aztec/circuit-types';
import { makeHeader } from '@aztec/circuits.js/testing';

import { type PrivateKeyAccount } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

/** Generate Account
 *
 * Create a random signer
 * @returns A random viem signer
 */
export const generateAccount = () => {
  const privateKey = generatePrivateKey();
  return privateKeyToAccount(privateKey);
};

/** Mock Attestation
 *
 * @param signer A viem signer to create a signature
 * @param slot The slot number the attestation is for
 * @returns A Block Attestation
 */
export const mockAttestation = async (signer: PrivateKeyAccount, slot: number = 0): Promise<BlockAttestation> => {
  // Use arbitrary numbers for all other than slot
  const header = makeHeader(1, 2, slot);
  const hash = header.hash();
  const message = hash.toString();
  const sigString = await signer.signMessage({ message });
  const signature = Buffer.from(sigString.slice(2), 'hex');

  return new BlockAttestation(header, signature);
};
