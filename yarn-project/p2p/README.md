# P2P

This package includes the functionality of the P2P networking required by the aztec node. The `P2PClient` provides an interface for the introduction of transactions to the Tx Pool and propagation of those transactions through the network. The `P2PService` offers an abstraction of the P2P networking.

The package depends on a block source in order to reconcile the transaction pool and remove settled transactions.

Additionally, the `BootstrapNode` class provides the functionality for running a P2P 'bootnode', one that serves the purpose of introducing new peers to the network. It does not participate in transaction exchange.

## Gossipsub scoring

Peer scoring is derived from gossipsub topic parameters and assumes counters decay on the gossipsub heartbeat. The decay interval is aligned to `P2P_GOSSIPSUB_INTERVAL_MS`, so if you tune the heartbeat interval you should expect scoring thresholds and decay behavior to shift accordingly.
