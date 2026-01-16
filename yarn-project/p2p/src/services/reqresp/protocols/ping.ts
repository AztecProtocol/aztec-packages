/**
 * Handles the ping request.
 * @param _msg - The ping request message.
 * @returns A resolved promise with the pong response.
 */
export function pingHandler(_msg: any): Promise<Buffer> {
  return Promise.resolve(Buffer.from('pong'));
}
