// TODO: implement fully

/**
 * Enum defining the possible reasons for a goodbye message.
 */
export enum GoodByeReason {
  /** The peer has shutdown, will be received whenever a peer's node is routinely stopped */
  SHUTDOWN = 0x1,
  // TOOD(md): what is the correct values to put in here - read other specs to see reasons
  //           what is even the point of the reason
  /** Whenever the peer must disconnect due to maintaining max peers */
  DISCONNECTED = 0x2,
  /** The peer has a low score, will be received whenever a peer's score is low */
  LOW_SCORE = 0x3,
  /** The peer has been banned, will be received whenever a peer is banned */
  BANNED = 0x4,
}

/**
 * Handles the goodbye request.
 * @param _msg - The goodbye request message.
 * @returns A resolved promise with the goodbye response.
 */
export function goodbyeHandler(_msg: any): Promise<Buffer> {
  return Promise.resolve(Buffer.from('goodbye'));
}
