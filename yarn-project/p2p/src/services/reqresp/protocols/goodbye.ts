// TODO: implement fully
/**
 * Handles the goodbye request.
 * @param _msg - The goodbye request message.
 * @returns A resolved promise with the goodbye response.
 */
export function goodbyeHandler(_msg: any): Promise<Buffer> {
  return Promise.resolve(Buffer.from('goodbye'));
}
