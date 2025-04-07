import { ClientIvcProof } from '@aztec/stdlib/proofs';

import { promises as fs } from 'fs';
import { join } from 'path';

export const CLIENT_IVC_PROOF_FILE_NAME = 'proof';

/**
 * Create a ClientIvcProof proof file.
 *
 * @param directory the directory to read the proof from.
 * @returns the encapsulated client ivc proof
 */
export async function readFromOutputDirectory(directory: string) {
  const clientIvcProofBuffer = await fs.readFile(join(directory, CLIENT_IVC_PROOF_FILE_NAME));
  return new ClientIvcProof(clientIvcProofBuffer);
}

/**
 * Serialize a ClientIvcProof to a proof file.
 *
 * @param proof the ClientIvcProof from object
 * @param directory the directory to write in
 */
export async function writeToOutputDirectory(clientIvcProof: ClientIvcProof, directory: string) {
  const { clientIvcProofBuffer } = clientIvcProof;
  await fs.writeFile(join(directory, CLIENT_IVC_PROOF_FILE_NAME), clientIvcProofBuffer);
}
