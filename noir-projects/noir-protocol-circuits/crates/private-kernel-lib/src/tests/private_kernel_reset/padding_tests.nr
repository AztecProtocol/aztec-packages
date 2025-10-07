use super::TestBuilder;
use types::{
    abis::{note_hash::NoteHash, nullifier::Nullifier, private_log::{PrivateLog, PrivateLogData}},
    constants::{MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS},
    hash::compute_siloed_nullifier,
    tests::utils::{assert_array_eq, pad_end},
};

#[test]
fn squashing_siloing_and_ordering_with_padded_items() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_note_hashes_with_logs(3);
    builder.previous_kernel.append_nullifiers(4);

    // Get ordered items before shuffling.
    let note_hashes = builder.previous_kernel.note_hashes.storage();
    let nullifiers = builder.previous_kernel.nullifiers.storage();
    let private_logs = builder.previous_kernel.private_logs.storage();

    // Shuffle.
    builder.previous_kernel.note_hashes = BoundedVec::from_parts_unchecked(
        pad_end([note_hashes[2], note_hashes[0], note_hashes[1]]),
        3,
    );
    builder.previous_kernel.nullifiers = BoundedVec::from_parts_unchecked(
        pad_end([nullifiers[2], nullifiers[1], nullifiers[0], nullifiers[3]]),
        4,
    );
    builder.previous_kernel.private_logs = BoundedVec::from_parts_unchecked(
        pad_end([private_logs[2], private_logs[0], private_logs[1]]),
        3,
    );

    // The nullifier at index 2 (original index 0) is nullifying the note hash at index 0 (original index 2).
    builder.nullify_pending_note_hash(2, 0);

    // Add padded items.
    let padded_note_hashes = [123, 456].map(|value| {
        NoteHash { value, counter: MAX_U32_VALUE }.scope(SIDE_EFFECT_MASKING_ADDRESS)
    });
    let padded_nullifiers = [500, 600].map(|value| {
        Nullifier {
            value: compute_siloed_nullifier(SIDE_EFFECT_MASKING_ADDRESS, value),
            counter: MAX_U32_VALUE,
            note_hash: 0,
        }
            .scope(SIDE_EFFECT_MASKING_ADDRESS)
    });
    let padded_private_logs = [
        PrivateLog { fields: pad_end([22, 33]), length: 2 },
        PrivateLog { fields: pad_end([77, 88, 99]), length: 3 },
    ]
        .map(|log| {
            PrivateLogData { log, note_hash_counter: 0, counter: MAX_U32_VALUE }.scope(
                SIDE_EFFECT_MASKING_ADDRESS,
            )
        });

    builder.padded_side_effects.note_hashes[2] = padded_note_hashes[0].note_hash.value;
    builder.padded_side_effects.note_hashes[3] = padded_note_hashes[1].note_hash.value;
    builder.padded_side_effects.nullifiers[3] = padded_nullifiers[0].nullifier.value;
    builder.padded_side_effects.nullifiers[4] = padded_nullifiers[1].nullifier.value;
    builder.padded_side_effects.private_logs[2] = padded_private_logs[0].inner.log;
    builder.padded_side_effects.private_logs[3] = padded_private_logs[1].inner.log;

    let public_inputs = builder.execute_with_siloing();

    // The note hash at index 2 is squashed.
    assert_array_eq(
        public_inputs.end.note_hashes.array,
        builder.compute_output_note_hashes([
            note_hashes[0],
            note_hashes[1],
            padded_note_hashes[0],
            padded_note_hashes[1],
        ]),
    );
    assert_eq(public_inputs.end.note_hashes.length, 4);

    // The nullifier at index 0 is squashed.
    assert_array_eq(
        public_inputs.end.nullifiers.array,
        builder.compute_output_nullifiers([
            nullifiers[1],
            nullifiers[2],
            nullifiers[3],
            padded_nullifiers[0],
            padded_nullifiers[1],
        ]),
    );
    assert_eq(public_inputs.end.nullifiers.length, 5);

    // The log at index 2 is squashed along with the note hash at index 2.
    assert_array_eq(
        public_inputs.end.private_logs.array,
        builder.compute_output_private_logs([
            private_logs[0],
            private_logs[1],
            padded_private_logs[0],
            padded_private_logs[1],
        ]),
    );
    assert_eq(public_inputs.end.private_logs.length, 4);
}
