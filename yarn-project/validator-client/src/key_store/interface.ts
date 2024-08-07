/** Key Store
 *
 * A keystore interface that can be replaced with a local keystore / remote signer service
 */
export interface ValidatorKeyStore {
  sign(message: Buffer): Promise<Buffer>;
  // validateSignature(signature: Buffer, message?: Buffer ): Promise<boolean>;
}
