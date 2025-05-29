pub(crate) mod pending_tagged_log;

use crate::{capsules::CapsuleArray, oracle};
use crate::messages::processing::pending_tagged_log::PendingTaggedLog;
use protocol_types::{address::AztecAddress, hash::sha256_to_field};

// Base slot for the pending tagged log array to which the fetch_tagged_logs oracle inserts found private logs.
global PENDING_TAGGED_LOG_ARRAY_BASE_SLOT: Field =
    sha256_to_field("AZTEC_NR::PENDING_TAGGED_LOG_ARRAY_BASE_SLOT".as_bytes());

/// Returns a `CapsuleArray` with all private logs that were found and need to be processed.
pub(crate) unconstrained fn get_private_logs(
    contract_address: AztecAddress,
) -> CapsuleArray<PendingTaggedLog> {
    // We will eventually perform log discovery via tagging here, but for now we simply call the `fetchTaggedLogs`
    // oracle. This makes PXE synchronize tags, download logs and store the pending tagged logs in capsule array which
    // are then retrieved and processed here.
    oracle::message_discovery::fetch_tagged_logs(PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

    // Get the logs from the capsule array and process them one by one
    CapsuleArray::<PendingTaggedLog>::at(contract_address, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT)
}
