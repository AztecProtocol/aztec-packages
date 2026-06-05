use crate::HandshakeRegistry::DiscoveredHandshake;

use aztec::{
    capsules::CapsuleArray,
    context::UtilityContext,
    ephemeral::EphemeralArray,
    messages::{
        discovery::{ComputeNoteHash, ComputeNoteNullifier, CustomMessageHandler, do_sync_state},
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        processing::{
            log_retrieval_request::{LogRetrievalRequest, LogSource},
            log_retrieval_response::LogRetrievalResponse,
            offchain::OffchainInboxSync,
        },
    },
    oracle::{capsules, message_processing},
    protocol::{
        address::AztecAddress,
        constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        hash::{compute_log_tag, sha256_to_field},
        traits::ToField,
    },
    utils::point::point_from_x_coord_and_sign,
};

/// Capsule base slot for the per-recipient list of discovered handshakes populated by
/// [`handshake_registry_sync`] and read by [`get_all_handshakes`].
global HANDSHAKES_CAPSULE_SLOT: Field = sha256_to_field("HANDSHAKE_REGISTRY::HANDSHAKES".as_bytes());

/// Capsule slot for the per-recipient sync cursor: the next block (inclusive) the discovery scan should start from.
global SYNC_CURSOR_CAPSULE_SLOT: Field = sha256_to_field("HANDSHAKE_REGISTRY::SYNC_CURSOR".as_bytes());

/// Ephemeral-array slot used by [`get_handshake_logs_in_range`] to batch a single log-retrieval request to the oracle.
global LOG_RETRIEVAL_REQUEST_ARRAY_SLOT: Field =
    sha256_to_field("HANDSHAKE_REGISTRY::LOG_RETRIEVAL_REQUEST_ARRAY".as_bytes());

/// Discovers non-interactive handshakes addressed to the syncing account.
///
/// On every sync, scans the recipient-keyed bootstrap tag over the blocks mined since the previous sync, decrypts
/// each matching log to recover the handshake `eph_pk`, and appends it to the recipient's
/// capsule list. It then falls through to [`do_sync_state`] so that normal note/event/partial-note discovery still
/// happens.
///
/// `scope` is the account PXE is syncing for, which doubles as both the recipient whose tag we scan and the capsule
/// scope we persist under, so handshakes for one account never leak into another's list.
pub(crate) unconstrained fn handshake_registry_sync(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler>,
    offchain_inbox_sync: Option<OffchainInboxSync>,
    scope: AztecAddress,
) {
    let cursor = capsules::load::<u32>(contract_address, SYNC_CURSOR_CAPSULE_SLOT, scope);
    let anchor_block = UtilityContext::new().block_number();

    // `to_block` is exclusive, so we add 1 to include the anchor block in the scan
    let next_block = anchor_block + 1;
    let should_scan = cursor.map(|c| c != next_block).unwrap_or(true);
    if should_scan {
        // Find all handshakes for the given recipient
        let tag = compute_log_tag(scope.to_field(), DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG);
        let logs = get_handshake_logs_in_range(contract_address, tag, cursor, Option::some(next_block));

        // Store all valid handshakes with their delivery mode
        let handshakes: CapsuleArray<DiscoveredHandshake> =
            CapsuleArray::at(contract_address, HANDSHAKES_CAPSULE_SLOT, scope);
        logs.for_each(|_i, log| {
            let ciphertext = aztec::utils::array::subbvec(log.log_payload, 0);

            let _ = AES128::decrypt(ciphertext, scope, contract_address)
                .and_then(|pt| {
                    point_from_x_coord_and_sign(pt.get(0), true).map(|pk| {
                        DiscoveredHandshake { eph_pk: pk, mode: pt.get(1) as u8 }
                    })
                })
                .map(|h| handshakes.push(h));
        });

        // Update the cursor
        capsules::store(
            contract_address,
            SYNC_CURSOR_CAPSULE_SLOT,
            next_block,
            scope,
        );
    }

    // Execute the default sync
    do_sync_state(
        contract_address,
        compute_note_hash,
        compute_note_nullifier,
        process_custom_message,
        offchain_inbox_sync,
        scope,
    );
}

/// Returns the capsule array of discovered handshakes for `recipient`.
pub(crate) unconstrained fn get_all_handshakes(
    contract_address: AztecAddress,
    recipient: AztecAddress,
) -> CapsuleArray<DiscoveredHandshake> {
    CapsuleArray::at(contract_address, HANDSHAKES_CAPSULE_SLOT, recipient)
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
