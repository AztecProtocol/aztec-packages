use crate::reset::{mutable_data_read_request::ReadIndexHint, read_request::ReadRequestStatus};
use dep::types::{
    abis::{public_data_read::PublicDataRead, public_data_write::OverridablePublicDataWrite},
    data::OverridablePublicDataTreeLeaf,
    utils::arrays::find_index_hint,
};

pub struct PublicDataReadRequestHints<let NUM_READS: u32> {
    read_request_statuses: [ReadRequestStatus; NUM_READS],
    pending_read_hints: [ReadIndexHint; NUM_READS],
    leaf_data_read_hints: [ReadIndexHint; NUM_READS],
}

pub unconstrained fn build_public_data_read_request_hints<let NUM_READS: u32, let NUM_WRITES: u32, let NUM_LEAVES: u32>(
    reads: [PublicDataRead; NUM_READS],
    writes: [OverridablePublicDataWrite; NUM_WRITES],
    leaf_data: [OverridablePublicDataTreeLeaf; NUM_LEAVES],
) -> PublicDataReadRequestHints<NUM_READS> {
    let mut read_request_statuses = [ReadRequestStatus::empty(); NUM_READS];
    let mut pending_read_hints = [ReadIndexHint::nada(NUM_READS); NUM_READS];
    let mut leaf_data_read_hints = [ReadIndexHint::nada(NUM_READS); NUM_READS];
    let mut num_pending_reads = 0;
    let mut num_leaf_data_reads = 0;
    for i in 0..reads.len() {
        let read = reads[i];
        if read.counter != 0 {
            let write_index = find_index_hint(
                writes,
                |w: OverridablePublicDataWrite| {
                    (w.inner().leaf_slot == read.leaf_slot)
                        & (read.counter > w.counter())
                        & ((read.counter < w.override_counter) | (w.override_counter == 0))
                },
            );
            if write_index != writes.len() {
                pending_read_hints[num_pending_reads] =
                    ReadIndexHint { read_request_index: i, value_index: write_index };
                read_request_statuses[i] = ReadRequestStatus::pending(num_pending_reads);
                num_pending_reads += 1;
            } else {
                let leaf_data_index = find_index_hint(
                    leaf_data,
                    |d: OverridablePublicDataTreeLeaf| d.leaf.slot == read.leaf_slot,
                );
                assert(
                    leaf_data_index != leaf_data.len(),
                    "cannot find a public data leaf or a pending write for the read request",
                );
                leaf_data_read_hints[num_leaf_data_reads] =
                    ReadIndexHint { read_request_index: i, value_index: leaf_data_index };
                read_request_statuses[i] = ReadRequestStatus::settled(num_leaf_data_reads);
                num_leaf_data_reads += 1;
            }
        }
    }

    PublicDataReadRequestHints { read_request_statuses, pending_read_hints, leaf_data_read_hints }
}
