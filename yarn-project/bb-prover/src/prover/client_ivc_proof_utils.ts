import { ClientIvcProof } from '@aztec/circuits.js';

import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * TODO(#7371): eventually remove client_ivc_prove_output_all_msgpack and properly handle these accumulators and VKs
 * Create a ClientIvcProof from the result of client_ivc_prove_output_all or client_ivc_prove_output_all_msgpack
 * @param directory the directory of results
 * @returns the encapsulated client ivc proof
 */
export async function readFromOutputDirectory(directory: string) {
  const [clientIvcVkBuffer, clientIvcProofBuffer] = await Promise.all(
    ['client_ivc_vk', 'client_ivc_proof'].map(fileName => fs.readFile(join(directory, fileName))),
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
    ['client_ivc_proof', clientIvcProofBuffer],
    ['client_ivc_vk', clientIvcVkBuffer],
  ] as const;
  await Promise.all(fileData.map(([fileName, buffer]) => fs.writeFile(join(directory, fileName), buffer)));
}
