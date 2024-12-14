import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * TODO(https://github.com/AztecProtocol/aztec-packages/issues/7370) refactory this to
 * eventually we read all these VKs from the data tree instead of passing them
 */
export class ClientIvcProof {
  constructor(
    // produced by the sequencer when making the tube proof
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7370): Need to precompute private kernel tail VK so we can verify this immediately in the tx pool
    // which parts of these are needed to quickly verify that we have a correct IVC proof
    public clientIvcProofBuffer: Buffer,
    public clientIvcVkBuffer: Buffer,
  ) {}

  public isEmpty() {
    return this.clientIvcProofBuffer.length === 0;
  }

  static empty() {
    return new ClientIvcProof(Buffer.from(''), Buffer.from(''));
  }

  /**
   * TODO(#7371): eventually remove client_ivc_prove_output_all_msgpack and properly handle these accumulators and VKs
   * Create a ClientIvcProof from the result of client_ivc_prove_output_all or client_ivc_prove_output_all_msgpack
   * @param directory the directory of results
   * @returns the encapsulated client ivc proof
   */
  static async readFromOutputDirectory(directory: string) {
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const [clientIvcVkBuffer, clientIvcProofBuffer] = await Promise.all(
      ['client_ivc_vk', 'client_ivc_proof'].map(fileName => fs.readFile(path.join(directory, fileName))),
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
  async writeToOutputDirectory(directory: string) {
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const { clientIvcProofBuffer, clientIvcVkBuffer } = this;
    const fileData = [
      ['client_ivc_proof', clientIvcProofBuffer],
      ['client_ivc_vk', clientIvcVkBuffer],
    ] as const;
    await Promise.all(fileData.map(([fileName, buffer]) => fs.writeFile(path.join(directory, fileName), buffer)));
  }

  static get schema() {
    return bufferSchemaFor(ClientIvcProof);
  }

  toJSON() {
    return this.toBuffer();
  }

  static fromBuffer(buffer: Buffer | BufferReader): ClientIvcProof {
    const reader = BufferReader.asReader(buffer);
    return new ClientIvcProof(reader.readBuffer(), reader.readBuffer());
  }

  public toBuffer() {
    return serializeToBuffer(
      this.clientIvcProofBuffer.length,
      this.clientIvcProofBuffer,
      this.clientIvcVkBuffer.length,
      this.clientIvcVkBuffer,
    );
  }
}
