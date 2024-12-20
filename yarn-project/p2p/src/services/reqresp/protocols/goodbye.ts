import { createLogger } from '@aztec/foundation/log';

import { type PeerId } from '@libp2p/interface';

import { type PeerManager } from '../../peer_manager.js';
import { ReqRespSubProtocol, type ReqRespSubProtocolHandler } from '../interface.js';
import { type ReqResp } from '../reqresp.js';

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
 * Pretty prints the goodbye reason.
 * @param reason - The goodbye reason.
 * @returns The pretty printed goodbye reason.
 */
export function prettyGoodbyeReason(reason: GoodByeReason): string {
  switch (reason) {
    case GoodByeReason.SHUTDOWN:
      return 'shutdown';
    case GoodByeReason.DISCONNECTED:
      return 'disconnected';
    case GoodByeReason.LOW_SCORE:
      return 'low score';
    case GoodByeReason.BANNED:
      return 'banned';
  }
}

/**
 * Handles a goodbye message request
 */
export class GoodbyeProtocolHandler {
  private logger = createLogger('p2p:goodbye-protocol');

  constructor(private reqresp: ReqResp) {}

  public async sendGoodbye(peerId: PeerId, reason: GoodByeReason): Promise<void> {
    try {
      await this.reqresp.sendRequestToPeer(peerId, ReqRespSubProtocol.GOODBYE, Buffer.from([reason]));
      this.logger.debug(`Sent goodbye to peer ${peerId.toString()} with reason ${reason}`);
    } catch (error) {
      this.logger.debug(`Failed to send goodbye to peer ${peerId.toString()}: ${error}`);
    }
  }
}

/**
 * Handles the goodbye request.
 * @param _msg - The goodbye request message.
 * @returns A resolved promise with the goodbye response.
 */
export function reqGoodbyeHandler(peerManager: PeerManager): ReqRespSubProtocolHandler {
  return (peerId: PeerId, _msg: Buffer) => {
    peerManager.goodbyeReceived(peerId);

    // TODO(md): they want to receive some kind of response, but we don't have a response here
    return Promise.resolve(Buffer.from(''));
  };
}
