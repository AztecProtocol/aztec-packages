# P2P Bootstrap

This package provides an implementation of a 'Bootstrap' P2P node. It's purpose is to assist new network participants in acquiring peers.

To build the package simply type `yarn build`, to start the boot node, simply type `yarn start`.

The node will require a number of environment variables:

P2P_UDP_LISTEN_ADDR - The address on which to listen for connections.
PEER_ID_PRIVATE_KEY - The private key to be used by the peer for secure communications with other peers. This key will also be used to derive the Peer ID.
P2P_UDP_ANNOUNCE_ADDR - The address that other peers should use to connect to this node, this may be different to P2P_TCP_LISTEN_ADDR if e.g. the node is behind a NAT.
