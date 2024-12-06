/**
 * Handles the ping request.
 * @param _msg - The ping request message.
 * @returns A resolved promise with the pong response.
 */
export function pingHandler(_msg: any): Promise<Buffer> {
  return Promise.resolve(Buffer.from('pong'));
}

/**
 * Handles the status request.
 * @param _msg - The status request message.
 * @returns A resolved promise with the ok response.
 */
export function statusHandler(_msg: any): Promise<Buffer> {
  return Promise.resolve(Buffer.from('ok'));
}
