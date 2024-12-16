export enum P2PClientType {
  // Full p2p clients will subscribe to all gossip topics
  Full,
  // Prove p2p clients will only subscribe to transaction and proving topics
  Prover,
}
