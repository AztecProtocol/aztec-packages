pub(crate) mod cursor;
pub(crate) mod discovered_handshakes;
pub(crate) mod rewindable_register;

use crate::sync::{cursor::SyncCursor, discovered_handshakes::record_discovered_handshake};
use aztec::{
    context::UtilityContext,
    ephemeral::EphemeralArray,
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
        traits::ToField,
    },
    utils::point::point_from_x_coord_and_sign,
};

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
    let cursor = SyncCursor::at(contract_address, scope);
    let from_block = cursor.next_block_to_scan();
    let anchor_block_header = UtilityContext::new().block_header();
    let anchor_block = anchor_block_header.block_number();

    // `to_block` is exclusive, so we add 1 to include the anchor block in the scan
    let next_block = anchor_block + 1;
    let should_scan = from_block.map(|b| b != next_block).unwrap_or(true);
    if should_scan {
        // Find all handshakes for the given recipient
        let tag = compute_log_tag(scope.to_field(), DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG);
        let logs = get_handshake_logs_in_range(contract_address, tag, from_block, Option::some(next_block));

        // Record all valid handshakes
        logs.for_each(|_i, log| {
            let ciphertext = aztec::utils::array::subbvec(log.log_payload, 0);

            let _ = AES128::decrypt(ciphertext, scope, contract_address)
                .and_then(|pt| {
                    point_from_x_coord_and_sign(pt.get(0), true).map(|pk| DiscoveredHandshake { eph_pk: pk })
                })
                .map(|h| record_discovered_handshake(
                    contract_address,
                    scope,
                    h,
                    log.origin_block,
                ));
        });

        cursor.advance(anchor_block_header);
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
