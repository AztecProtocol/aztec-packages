use crate::reset::{squash_transient_data, TransientDataSquashingHint};
use ::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, note_hash::NoteHash,
        nullifier::Nullifier, private_log::PrivateLogData,
    },
    constants::{MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX},
    side_effect::{Counted, Scoped},
    utils::arrays::ClaimedLengthArray,
};

pub struct SquashedOutputArrayHints {
    // We use the term "kept", because "squashed_note_hashes" could be misunderstood to incorrectly mean
    // "the notes_hashes which were squashed (deleted) from existence", whereas these arrays represent
    // the opposite: these are the note_hashes which were NOT deleted; i.e. the note_hashes which were _kept_.
    pub kept_note_hashes: ClaimedLengthArray<Scoped<Counted<NoteHash>>, MAX_NOTE_HASHES_PER_TX>,
    pub kept_nullifiers: ClaimedLengthArray<Scoped<Counted<Nullifier>>, MAX_NULLIFIERS_PER_TX>,
    pub kept_private_logs: ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, MAX_PRIVATE_LOGS_PER_TX>,
}

// Splice-removes some transient notes, nullifiers, and private logs, from the previous kernel's
// arrays of new note_hashes, nullifiers, and private logs.
// transient_data_squashing_hints - dictates the selection of items that will get removed by this
// iteration of the reset circuit.
pub unconstrained fn generate_squashed_output_array_hints<let TransientDataSquashingHintsLen: u32>(
    previous_kernel: PrivateKernelCircuitPublicInputs,
    transient_data_squashing_hints: [TransientDataSquashingHint; TransientDataSquashingHintsLen],
) -> SquashedOutputArrayHints {
    // Splice-removes transient items (as opposed to setting items to "empty" in-place).
    // I.e. for each item that is removed, all the rhs items shift one to the left.
    // We're effectively constructing output lists of the items that will NOT be processed by this reset kernel
    // iteration, but will instead be propagated to the next kernel iteration.
    let (kept_note_hashes, kept_nullifiers, kept_private_logs) = squash_transient_data(
        previous_kernel.end.note_hashes,
        previous_kernel.end.nullifiers,
        previous_kernel.end.private_logs,
        transient_data_squashing_hints,
    );

    SquashedOutputArrayHints { kept_note_hashes, kept_nullifiers, kept_private_logs }
}
