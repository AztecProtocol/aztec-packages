use crate::reset::{squash_transient_data, TransientDataSquashingHint};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, note_hash::NoteHash,
        nullifier::Nullifier, private_log::PrivateLogData,
    },
    constants::{MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX},
    side_effect::{Counted, Scoped},
    utils::arrays::ClaimedLengthArray,
};

pub struct ResetOutputHints {
    pub kept_note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, MAX_NOTE_HASHES_PER_TX>,
    pub kept_nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, MAX_NULLIFIERS_PER_TX>,
    pub kept_private_logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, MAX_PRIVATE_LOGS_PER_TX>,
}

pub unconstrained fn generate_reset_output_hints<let TransientDataSquashingHintsLen: u32>(
    previous_kernel: PrivateKernelCircuitPublicInputs,
    transient_data_squashing_hints: [TransientDataSquashingHint; TransientDataSquashingHintsLen],
) -> ResetOutputHints {
    // Splice-removes transient items (as opposed to setting items to "empty" in-place).
    let (kept_note_hashes, kept_nullifiers, kept_private_logs) = squash_transient_data(
        previous_kernel.end.note_hashes,
        previous_kernel.end.nullifiers,
        previous_kernel.end.private_logs,
        transient_data_squashing_hints,
    );

    ResetOutputHints { kept_note_hashes, kept_nullifiers, kept_private_logs }
}
