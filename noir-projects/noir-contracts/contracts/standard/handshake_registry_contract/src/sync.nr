use aztec::{
    context::UtilityContext,
    ephemeral::EphemeralArray,
    facts::{delete_fact_collection, Fact, FactCollection, get_fact_collection, OriginBlock, record_retractable_fact},
    messages::{
        delivery::handshake::DiscoveredHandshake,
        discovery::{
            ComputeNoteHash, ComputeNoteNullifier, CustomMessageHandler, do_sync_state_without_handshake_discovery,
        },
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        processing::{
            log_retrieval_request::{LogRetrievalRequest, LogSource},
            log_retrieval_response::LogRetrievalResponse,
            offchain::OffchainInboxSync,
        },
    },
    oracle::message_processing,
    protocol::{
        address::AztecAddress,
        constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        hash::{compute_log_tag, sha256_to_field},
        traits::{Deserialize, Hash, Serialize, ToField},
    },
    utils::point::point_from_x_coord_and_sign,
};

/// Fact-collection type id of the per-recipient discovered handshakes populated by [`handshake_registry_sync`] and
/// read by [`get_all_handshakes`]. Each recipient (the fact scope) has a single collection of this type holding one
/// fact per discovered handshake, in discovery order.
pub(crate) global DISCOVERED_HANDSHAKES_TYPE_ID: Field =
    sha256_to_field("HANDSHAKE_REGISTRY::DISCOVERED_HANDSHAKES".as_bytes());

/// Collection id of the singleton discovered-handshakes collection.
pub(crate) global DISCOVERED_HANDSHAKES_COLLECTION_ID: Field = 0;

/// Fact type id of the fact storing a serialized [`DiscoveredHandshake`] inside the discovered-handshakes collection.
pub(crate) global HANDSHAKE_DISCOVERED: Field = sha256_to_field("HANDSHAKE_REGISTRY::HANDSHAKE_DISCOVERED".as_bytes());

/// Fact-collection type id of the per-recipient sync cursor.
pub(crate) global SYNC_CURSOR_TYPE_ID: Field = sha256_to_field("HANDSHAKE_REGISTRY::SYNC_CURSOR".as_bytes());

/// Fact type id of the single fact in the cursor collection. The fact has an empty payload: the cursor value is its
/// origin block (the anchor block of the last completed scan).
pub(crate) global SYNC_CURSOR: Field = sha256_to_field("HANDSHAKE_REGISTRY::SYNC_CURSOR_FACT".as_bytes());

/// Collection id of the singleton cursor collection.
pub(crate) global SYNC_CURSOR_COLLECTION_ID: Field = 0;

/// Ephemeral-array slot used by [`get_handshake_logs_in_range`] to batch a single log-retrieval request to the oracle.
global LOG_RETRIEVAL_REQUEST_ARRAY_SLOT: Field =
    sha256_to_field("HANDSHAKE_REGISTRY::LOG_RETRIEVAL_REQUEST_ARRAY".as_bytes());

/// Discovers non-interactive handshakes addressed to the syncing account.
///
/// On every sync, scans the recipient-keyed bootstrap tag over the blocks mined since the previous sync, decrypts
/// each matching log to recover the handshake `eph_pk`, and records it as a retractable fact whose origin is the block
/// the log landed in, so a reorg pruning that block makes the handshake invisible again. It then falls through to
/// [`do_sync_state`] so that normal note/event/partial-note discovery still happens.
///
/// `scope` is the account PXE is syncing for, which doubles as both the recipient whose tag we scan and the fact
/// scope we persist under, so handshakes for one account never leak into another's list.
pub(crate) unconstrained fn handshake_registry_sync(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler>,
    offchain_inbox_sync: Option<OffchainInboxSync>,
    scope: AztecAddress,
) {
    let cursor = load_sync_cursor(contract_address, scope);
    let anchor_block_header = UtilityContext::new().block_header();
    let anchor_block = anchor_block_header.block_number();

    // `to_block` is exclusive, so we add 1 to include the anchor block in the scan
    let next_block = anchor_block + 1;
    let should_scan = cursor.map(|c| c != next_block).unwrap_or(true);
    if should_scan {
        // Find all handshakes for the given recipient
        let tag = compute_log_tag(scope.to_field(), DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG);
        let logs = get_handshake_logs_in_range(contract_address, tag, cursor, Option::some(next_block));

        // Record all valid handshakes
        logs.for_each(|_i, log: LogRetrievalResponse| {
            let ciphertext = aztec::utils::array::subbvec(log.log_payload, 0);

            let _ = AES128::decrypt(ciphertext, scope, contract_address)
                .and_then(|pt| {
                    point_from_x_coord_and_sign(pt.get(0), true).map(|pk| DiscoveredHandshake { eph_pk: pk })
                })
                .map(|h| record_discovered_handshake(
                    contract_address,
                    scope,
                    h,
                    OriginBlock { block_number: log.block_number, block_hash: log.block_hash },
                ));
        });

        store_sync_cursor(
            contract_address,
            scope,
            OriginBlock { block_number: anchor_block, block_hash: anchor_block_header.hash() },
        );
    }

    do_sync_state_without_handshake_discovery(
        contract_address,
        compute_note_hash,
        compute_note_nullifier,
        process_custom_message,
        offchain_inbox_sync,
        scope,
    );
}

/// Returns the discovered handshakes for `recipient`, in discovery order.
///
/// Facts within a collection are insertion-ordered, so new handshakes only ever append, keeping
/// [`HandshakeRegistry::get_handshakes`] pagination stable across pages.
pub(crate) unconstrained fn get_all_handshakes(
    contract_address: AztecAddress,
    recipient: AztecAddress,
) -> EphemeralArray<DiscoveredHandshake> {
    let maybe_collection = get_fact_collection(
        contract_address,
        recipient,
        DISCOVERED_HANDSHAKES_TYPE_ID,
        DISCOVERED_HANDSHAKES_COLLECTION_ID,
    );
    if maybe_collection.is_some() {
        maybe_collection.unwrap().facts.map(|fact: Fact| handshake_from_payload(fact.payload))
    } else {
        EphemeralArray::empty()
    }
}

/// Records a discovered handshake as a retractable fact originated at the block its announcement log landed in.
///
/// Fact identity covers the payload and origin block, so re-recording the same handshake at the same origin (e.g.
/// when rescanning after the cursor was retracted by a reorg) is a no-op.
unconstrained fn record_discovered_handshake(
    contract_address: AztecAddress,
    scope: AztecAddress,
    handshake: DiscoveredHandshake,
    origin_block: OriginBlock,
) {
    record_retractable_fact(
        contract_address,
        scope,
        DISCOVERED_HANDSHAKES_TYPE_ID,
        DISCOVERED_HANDSHAKES_COLLECTION_ID,
        HANDSHAKE_DISCOVERED,
        handshake_to_payload(handshake),
        origin_block,
    );
}

/// Serializes a [`DiscoveredHandshake`] into a fact payload.
unconstrained fn handshake_to_payload(handshake: DiscoveredHandshake) -> EphemeralArray<Field> {
    let fields = handshake.serialize();
    let payload: EphemeralArray<Field> = EphemeralArray::empty();
    for i in 0..fields.len() {
        payload.push(fields[i]);
    }
    payload
}

/// Deserializes a [`DiscoveredHandshake`] from a fact payload.
unconstrained fn handshake_from_payload(payload: EphemeralArray<Field>) -> DiscoveredHandshake {
    let n = <DiscoveredHandshake as Deserialize>::N;
    let mut fields = [0; <DiscoveredHandshake as Deserialize>::N];
    for i in 0..n {
        fields[i] = payload.get(i);
    }
    Deserialize::deserialize(fields)
}

/// Returns the next block (inclusive) the discovery scan should start from, or `None` if no canonical cursor exists,
/// either because this scope never synced or because the cursor fact's origin block was reorg'd away. In the latter
/// case the caller rescans the full range and fact idempotency deduplicates re-discovered handshakes.
unconstrained fn load_sync_cursor(contract_address: AztecAddress, scope: AztecAddress) -> Option<u32> {
    get_fact_collection(
        contract_address,
        scope,
        SYNC_CURSOR_TYPE_ID,
        SYNC_CURSOR_COLLECTION_ID,
    )
        .map(|collection: FactCollection| collection.facts.get(0).origin_block.unwrap().block_number + 1)
}

/// Replaces the cursor fact with one originated at `anchor_block` (the block the completed scan ran against), so a
/// reorg pruning any scanned block also retracts the cursor and the next sync rescans.
unconstrained fn store_sync_cursor(contract_address: AztecAddress, scope: AztecAddress, anchor_block: OriginBlock) {
    delete_fact_collection(
        contract_address,
        scope,
        SYNC_CURSOR_TYPE_ID,
        SYNC_CURSOR_COLLECTION_ID,
    );
    record_retractable_fact(
        contract_address,
        scope,
        SYNC_CURSOR_TYPE_ID,
        SYNC_CURSOR_COLLECTION_ID,
        SYNC_CURSOR,
        EphemeralArray::empty(),
        anchor_block,
    );
}

/// Fetches all private logs emitted under `tag` in the block range `[from_block, to_block)`.
///
/// Thin wrapper around [`message_processing::get_logs_by_tag`] that batches a single request and unwraps the single
/// matching response array.
unconstrained fn get_handshake_logs_in_range(
    contract_address: AztecAddress,
    tag: Field,
    from_block: Option<u32>,
    to_block: Option<u32>,
) -> EphemeralArray<LogRetrievalResponse> {
    let requests = EphemeralArray::empty_at(LOG_RETRIEVAL_REQUEST_ARRAY_SLOT);
    requests.push(
        LogRetrievalRequest {
            contract_address,
            unsiloed_tag: tag,
            source: LogSource.PRIVATE,
            from_block: from_block.map(|b| b as Field),
            to_block: to_block.map(|b| b as Field),
        },
    );

    message_processing::get_logs_by_tag(requests).get(0)
}
