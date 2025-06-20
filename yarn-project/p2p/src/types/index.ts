/***************************************************
 *                    Events
 ***************************************************/

/**
 * Events emitted from the libp2p node.
 */
export enum PeerEvent {
  DISCOVERED = 'peer:discovered',
  CONNECTED = 'peer:connect',
  DISCONNECTED = 'peer:disconnect',
}

/**
 * Events emitted from the Discv5 service.
 */
export enum Discv5Event {
  DISCOVERED = 'discovered',
  ENR_ADDED = 'enrAdded',
  MULTIADDR_UPDATED = 'multiaddrUpdated',
}

/**
 * Events emitted from the GossipSub protocol.
 */
export enum GossipSubEvent {
  MESSAGE = 'gossipsub:message',
}

/***************************************************
 *                    Types
 ***************************************************/

/**
 * Aztec network specific types
 */
export const AZTEC_ENR_KEY = 'aztec';
export const AZTEC_ENR_CLIENT_VERSION_KEY = 'ver';
