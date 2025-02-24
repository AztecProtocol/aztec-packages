import { ClientIvcProof } from '@aztec/circuits.js/proofs';

import { promises as fs } from 'fs';
import { join } from 'path';

export const CLIENT_IVC_VK_FILE_NAME = 'vk';
export const CLIENT_IVC_PROOF_FILE_NAME = 'proof';

/**
 * TODO(#7371): eventually remove client_ivc_prove_output_all_msgpack and properly handle these accumulators and VKs
 * Create a ClientIvcProof from the result of client_ivc_prove_output_all or client_ivc_prove_output_all_msgpack
 * @param directory the directory of results
 * @returns the encapsulated client ivc proof
 */
export async function readFromOutputDirectory(directory: string) {
  const [clientIvcVkBuffer, clientIvcProofBuffer] = await Promise.all(
    [CLIENT_IVC_VK_FILE_NAME, CLIENT_IVC_PROOF_FILE_NAME].map(fileName => fs.readFile(join(directory, fileName))),
  );
  return new ClientIvcProof(clientIvcProofBuffer, clientIvcVkBuffer);
}

/**
 * TODO(#7371): eventually remove client_ivc_prove_output_all_msgpack and properly handle these accumulators and VKs
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
  const { clientIvcProofBuffer, clientIvcVkBuffer } = clientIvcProof;
  const fileData = [
    [CLIENT_IVC_PROOF_FILE_NAME, clientIvcProofBuffer],
    [CLIENT_IVC_VK_FILE_NAME, clientIvcVkBuffer],
  ] as const;
  await Promise.all(fileData.map(([fileName, buffer]) => fs.writeFile(join(directory, fileName), buffer)));
}
