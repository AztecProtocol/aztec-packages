import { BlockAttestation, Signature, TxHash } from '@aztec/circuit-types';
import { makeHeader } from '@aztec/circuits.js/testing';
import { Fr } from '@aztec/foundation/fields';
import { serializeToBuffer } from '@aztec/foundation/serialize';

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
export const mockAttestation = async (
  signer: PrivateKeyAccount,
  slot: number = 0,
  archive: Fr = Fr.random(),
): Promise<BlockAttestation> => {
  // Use arbitrary numbers for all other than slot
  const header = makeHeader(1, 2, slot);
  const txs = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());

  const message: `0x${string}` = `0x${serializeToBuffer([archive, txs]).toString('hex')}`;
  const sigString = await signer.signMessage({ message });

  const signature = Signature.from0xString(sigString);
  return new BlockAttestation(header, archive, txs, signature);
};
