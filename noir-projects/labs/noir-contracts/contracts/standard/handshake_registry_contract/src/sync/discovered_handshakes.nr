use crate::sync::rewindable_register::{deserialize_payload, serialize_payload};
use aztec::{
    ephemeral::EphemeralArray,
    facts::{get_fact_collection, OriginBlock, record_retractable_fact},
    messages::delivery::handshake::DiscoveredHandshake,
    protocol::{address::AztecAddress, hash::sha256_to_field},
};

/// Fact-collection type id of the per-recipient discovered handshakes populated by [`record_discovered_handshake`]
/// and read by [`get_all_discovered_handshakes`]. Each recipient (the fact scope) has a single collection of this
/// type holding one fact per discovered handshake, in discovery order.
global DISCOVERED_HANDSHAKES_TYPE_ID: Field = sha256_to_field("HANDSHAKE_REGISTRY::DISCOVERED_HANDSHAKES".as_bytes());

/// Collection id of the singleton discovered-handshakes collection.
global DISCOVERED_HANDSHAKES_COLLECTION_ID: Field = 0;

/// Fact type id of the fact storing a serialized [`DiscoveredHandshake`] inside the discovered-handshakes collection.
global HANDSHAKE_DISCOVERED: Field = sha256_to_field("HANDSHAKE_REGISTRY::HANDSHAKE_DISCOVERED".as_bytes());

/// Records a discovered handshake for `recipient`.
///
/// The handshake originates at the block its announcement log landed in, so a reorg pruning that block makes the
/// handshake invisible again. Fact identity covers the payload and origin block, so re-recording the same handshake
/// at the same origin is a no-op.
pub(crate) unconstrained fn record_discovered_handshake(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    handshake: DiscoveredHandshake,
    origin_block: OriginBlock,
) {
    record_retractable_fact(
        contract_address,
        recipient,
        DISCOVERED_HANDSHAKES_TYPE_ID,
        DISCOVERED_HANDSHAKES_COLLECTION_ID,
        HANDSHAKE_DISCOVERED,
        serialize_payload(handshake),
        origin_block,
    );
}

/// Returns the discovered handshakes for `recipient`; only non-interactive handshakes are ever discovered.
///
/// The order of facts within a collection is not specified, but it is stable, keeping
/// [`HandshakeRegistry::get_non_interactive_handshakes`] pagination consistent across pages.
pub(crate) unconstrained fn get_all_discovered_handshakes(
    contract_address: AztecAddress,
    recipient: AztecAddress,
) -> EphemeralArray<DiscoveredHandshake> {
    get_fact_collection(
        contract_address,
        recipient,
        DISCOVERED_HANDSHAKES_TYPE_ID,
        DISCOVERED_HANDSHAKES_COLLECTION_ID,
    )
        .map_or(EphemeralArray::empty(), |collection| collection.facts.map(|fact| deserialize_payload(fact.payload)))
}

/// Returns the origin block number of each of `recipient`'s discovered handshakes. Only used by tests, to assert
/// that handshake facts originate at the log's block rather than the sync anchor.
pub(crate) unconstrained fn origin_block_numbers(
    contract_address: AztecAddress,
    recipient: AztecAddress,
) -> EphemeralArray<u32> {
    get_fact_collection(
        contract_address,
        recipient,
        DISCOVERED_HANDSHAKES_TYPE_ID,
        DISCOVERED_HANDSHAKES_COLLECTION_ID,
    )
        .map_or(EphemeralArray::empty(), |collection| {
            collection.facts.map(|fact| fact.origin_block.unwrap().block_number)
        })
}
