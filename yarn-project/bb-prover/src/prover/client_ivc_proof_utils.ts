import { ClientIvcProof } from '@aztec/stdlib/proofs';

import { promises as fs } from 'fs';
import { join } from 'path';

export const CLIENT_IVC_PROOF_FILE_NAME = 'proof';

/**
 * Create a ClientIvcProof from the result of client_ivc_prove_output_all or client_ivc_prove_output_all_msgpack
 * @param directory the directory of results
 * @returns the encapsulated client ivc proof
 */
export async function readFromOutputDirectory(directory: string) {
  const clientIvcProofBuffer = await fs.readFile(join(directory, CLIENT_IVC_PROOF_FILE_NAME));
  return new ClientIvcProof(clientIvcProofBuffer);
}

/**
 * Serialize a ClientIvcProof to the files expected by prove_tube
 *
 * Example usage:
 *  await runInDirectory(bbWorkingDirectory, async (dir: string) => {
 *    await privateTx.clientIvcProof!.writeToOutputDirectory(bbWorkingDirectory);
 *    const result = await generateTubeProof(bbPath, dir, logger.info)
 *    expect(result.status).toBe(BB_RESULT.SUCCESS)
 *  });
 * @param proof the ClientIvcProof from readFromOutputDirectory
 * @param directory the directory of results
 */
export async function writeToOutputDirectory(clientIvcProof: ClientIvcProof, directory: string) {
  const { clientIvcProofBuffer } = clientIvcProof;
  await fs.writeFile(join(directory, CLIENT_IVC_PROOF_FILE_NAME), clientIvcProofBuffer);
}
