mod validate_note_logs_linked_to_note_hashes;

use crate::{
    abis::{PaddedSideEffects, PrivateKernelResetHints},
    accumulated_data::{
        assert_sorted_padded_transformed_array_capped_size,
        assert_sorted_padded_transformed_i_array_capped_size,
    },
    components::reset_output_composer::SquashedOutputArrayHints,
    reset::{KeyValidationRequestsValidator, ReadRequestValidator, TransientDataValidator},
};
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        note_hash::NoteHash,
        nullifier::Nullifier,
        private_log::{PrivateLog, PrivateLogData},
    },
    address::AztecAddress,
    constants::{MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS},
    hash::{
        compute_note_nonce_and_unique_note_hash, compute_siloed_note_hash,
        compute_siloed_private_log_first_field, silo_nullifier,
    },
    side_effect::{Counted, Ordered, Scoped},
};
use validate_note_logs_linked_to_note_hashes::validate_note_logs_linked_to_note_hashes;

/// Computes the output note hash from first principles and compares it against the claimed out_note_hash.
fn assert_correctly_siloed_note_hash(
    out_note_hash: Field,
    prev: Scoped<Counted<NoteHash>>,
    index: u32,
    claimed_first_nullifier: Field,
    is_private_only: bool,
    min_revertible_side_effect_counter: u32,
) {
    // We determine which of these two values is appropriate, based on the revertible-ness of the note:
    let (siloed_note_hash, unique_siloed_note_hash) = if prev.contract_address.is_zero() {
        // Then this is a nullish note, so we don't touch it. (Given earlier checks in this circuit, we know this is not an
        // already-siloed note, because we can only run a siloing reset circuit once).
        (prev.innermost(), prev.innermost())
    } else {
        let siloed = compute_siloed_note_hash(prev.contract_address, prev.innermost());
        let unique =
            compute_note_nonce_and_unique_note_hash(siloed, claimed_first_nullifier, index);
        (siloed, unique)
    };

    // We've already spent constraints checking `prev.counter() < min_revertible_side_effect_counter` in
    // transient_data.nr (there, it was: `note_hash.counter() >= split_counter`).
    // I wonder how many extra constraints this is costing?
    // If it's significant, we could pass a hint for each note hash, to say whether it's revertible or non-revertible,
    // and just check that hint once, somewhere. In fact, that hint could be checked in the inner kernel
    // circuit, and propagated as a public input (via the data bus). That would save 3 inequality checks in this
    // reset circuit. Hmm.. but it would cost inequalities for every note & nullifier in a private call in the inner circuit... I wonder which is best...
    let is_non_revertible = prev.counter() < min_revertible_side_effect_counter;
    let computed_note_hash = if is_private_only | is_non_revertible {
        unique_siloed_note_hash
    } else {
        // Revertible note hashes are not siloed with a note_nonce if public execution will occur later
        // (i.e., `is_private_only` == false). This is because additional non-revertible note hashes may be added during
        // public execution, making the final position of the revertible note hashes from private execution uncertain
        // at this point.
        //
        // Note: padded note hashes have a counter of `MAX_U32_VALUE`, which is always greater than
        // `min_revertible_side_effect_counter`, so they are also not unique-ified with a note_nonce.
        siloed_note_hash
    };
    assert_eq(
        out_note_hash,
        computed_note_hash,
        "Output note hash does not match correctly-siloed note hash",
    );
}

// Verifies that the first field of a private log is siloed with the contract address.
// Apps can define the meaning of the first field: it could be a tag, part of a tag, or a random value embedded in the
// content, etc.
// This siloing ensures that the log is verifiably linked to the specified contract address.
// Without this check, an app could impersonate another by emitting a log identical to one from a different contract
// or copying a tag from another contract while using entirely different content, potentially misleading the recipient.
fn assert_valid_siloed_private_log(out: PrivateLog, prev: Scoped<Counted<PrivateLogData>>) -> () {
    // Q: is checking `if prev.contract_address.is_zero()` being used to mean "if the prev is empty"?
    let expected_first_field = if prev.contract_address.is_zero() {
        prev.innermost().log.fields[0]
    } else {
        compute_siloed_private_log_first_field(
            prev.contract_address,
            prev.innermost().log.fields[0],
        )
    };
    assert_eq(out.fields[0], expected_first_field);
    for i in 1..out.fields.len() {
        assert_eq(out.fields[i], prev.innermost().log.fields[i]);
    }

    assert_eq(out.length, prev.innermost().log.length);
}

pub struct ResetOutputValidator<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> {
    output: PrivateKernelCircuitPublicInputs,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    padded_side_effects: PaddedSideEffects,
    reset_hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
    squashed_output_array_hints: SquashedOutputArrayHints,
}

impl<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> ResetOutputValidator<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen> {
    pub fn new(
        output: PrivateKernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        padded_side_effects: PaddedSideEffects,
        reset_hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
        squashed_output_array_hints: SquashedOutputArrayHints,
    ) -> Self {
        ResetOutputValidator {
            output,
            previous_kernel,
            padded_side_effects,
            reset_hints,
            squashed_output_array_hints,
        }
    }

    pub fn validate<let NoteHashPendingReadAmount: u32, let NoteHashSettledReadAmount: u32, let NullifierPendingReadAmount: u32, let NullifierSettledReadAmount: u32, let KeyValidationAmount: u32, let TransientDataSquashingAmount: u32, let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
    ) {
        self.validate_unchanged_data();

        // This is the constraint-heaviest part of the circuit, because of all the merkle membership checks.
        self
            .validate_validation_requests::<NoteHashPendingReadAmount, NoteHashSettledReadAmount, NullifierPendingReadAmount, NullifierSettledReadAmount, KeyValidationAmount>();

        // Validates that the `squashed_output_array_hints` arrays are correctly computed, by taking the
        // previous kernel's arrays and asserting that transient notes have been correctly splice-removed.
        self.validate_transient_data::<TransientDataSquashingAmount>();

        // Validates that note logs (where log.note_hash_counter != 0) are correctly linked to existing note hashes.
        if TransientDataSquashingAmount == 0 {
            // The following check is unnecessary if there is transient data to be squashed
            // (i.e. `TransientDataSquashingAmount` != 0),
            // because `transient_data/validate_log_squashing` will be called,
            // and it ensures that each note log is either:
            // - linked to a note hash being squashed, or
            // - linked to one that is being kept.
            //
            // In doing so, it guarantees all note logs are correctly linked to existing note hashes.
            //
            // Although this check is performed in the reset circuit, we can be confident that it has been run before
            // executing a tail circuit.
            // This is because the reset circuit is required to silo private logs, and as part of that process, all
            // private logs are validated.
            validate_note_logs_linked_to_note_hashes(
                self.previous_kernel.end.private_logs,
                self.previous_kernel.end.note_hashes,
            );
        }

        // Validates that the hinted output arrays are correctly sorted, siloed, and padded, by taking the
        // (now-validated-to-be-correct) hinted 'kept' arrays and asserting that transformations
        // from the hinted 'kept' arrays result in the hinted output arrays.
        self
            .validate_sorted_siloed_padded_data::<NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount>();
    }

    fn validate_unchanged_data(self) {
        assert_eq(self.output.constants, self.previous_kernel.constants);

        assert_eq(
            self.output.min_revertible_side_effect_counter,
            self.previous_kernel.min_revertible_side_effect_counter,
        );

        // accumulated_data
        assert_eq(self.output.end.l2_to_l1_msgs, self.previous_kernel.end.l2_to_l1_msgs);
        assert_eq(
            self.output.end.contract_class_logs_hashes,
            self.previous_kernel.end.contract_class_logs_hashes,
        );
        assert_eq(
            self.output.end.public_call_requests,
            self.previous_kernel.end.public_call_requests,
        );
        assert_eq(self.output.end.private_call_stack, self.previous_kernel.end.private_call_stack);
        assert_eq(
            self.output.public_teardown_call_request,
            self.previous_kernel.public_teardown_call_request,
        );

        assert_eq(self.output.fee_payer, self.previous_kernel.fee_payer);

        // Reset doesn't mutate include_by_timestamp
        assert_eq(self.output.include_by_timestamp, self.previous_kernel.include_by_timestamp);

        assert_eq(self.output.is_private_only, self.previous_kernel.is_private_only);

        assert_eq(
            self.output.claimed_first_nullifier,
            self.previous_kernel.claimed_first_nullifier,
        );
        assert_eq(
            self.output.claimed_revertible_counter,
            self.previous_kernel.claimed_revertible_counter,
        );
    }

    fn validate_validation_requests<let NoteHashPendingReadAmount: u32, let NoteHashSettledReadAmount: u32, let NullifierPendingReadAmount: u32, let NullifierSettledReadAmount: u32, let KeyValidationAmount: u32>(
        self,
    ) {
        let validation_requests = self.previous_kernel.validation_requests;
        let tree_snapshots = self.previous_kernel.constants.anchor_block_header.state.partial;
        let output = self.output.validation_requests;

        // note_hash_read_requests
        ReadRequestValidator {
            read_requests: validation_requests.note_hash_read_requests,
            pending_values: self.previous_kernel.end.note_hashes,
            tree_root: tree_snapshots.note_hash_tree.root,
            propagated_read_requests: output.note_hash_read_requests,
            hints: self.reset_hints.note_hash_read_request_hints,
        }
            .validate::<NoteHashPendingReadAmount, NoteHashSettledReadAmount>();

        // nullifier_read_requests
        ReadRequestValidator {
            read_requests: validation_requests.nullifier_read_requests,
            pending_values: self.previous_kernel.end.nullifiers,
            tree_root: tree_snapshots.nullifier_tree.root,
            propagated_read_requests: output.nullifier_read_requests,
            hints: self.reset_hints.nullifier_read_request_hints,
        }
            .validate::<NullifierPendingReadAmount, NullifierSettledReadAmount>();

        // key_validation_requests
        KeyValidationRequestsValidator {
            key_validation_requests: validation_requests
                .scoped_key_validation_requests_and_generators,
            propagated_key_validation_requests: output
                .scoped_key_validation_requests_and_generators,
            hints: self.reset_hints.key_validation_hints,
        }
            .validate::<KeyValidationAmount>();
    }

    fn validate_transient_data<let TransientDataSquashingAmount: u32>(self) {
        // For private-only txs, we squash all transient data.
        let split_counter = if self.previous_kernel.is_private_only {
            0
        } else {
            self.previous_kernel.claimed_revertible_counter
        };

        // A compile-time `if` statement over a compile-time constant.
        // Recall: TransientDataSquashingAmount is the hard-coded number of squashing iterations
        // that this variant of the Reset circuit can perform.
        if TransientDataSquashingAmount == 0 {
            assert_eq(
                self.squashed_output_array_hints.kept_note_hashes,
                self.previous_kernel.end.note_hashes,
                "mismatch kept note hashes",
            );
            assert_eq(
                self.squashed_output_array_hints.kept_nullifiers,
                self.previous_kernel.end.nullifiers,
                "mismatch kept nullifiers",
            );
            assert_eq(
                self.squashed_output_array_hints.kept_private_logs,
                self.previous_kernel.end.private_logs,
                "mismatch kept private logs",
            );
        } else {
            // Notice: a lot happens inside `new`:
            TransientDataValidator::new(
                self.previous_kernel.end.note_hashes,
                self.previous_kernel.end.nullifiers,
                self.previous_kernel.end.private_logs,
                self.squashed_output_array_hints.kept_note_hashes,
                self.squashed_output_array_hints.kept_nullifiers,
                self.squashed_output_array_hints.kept_private_logs,
                split_counter,
                self.reset_hints.transient_data_squashing_hints,
            )
                .validate();
        }
    }

    fn validate_sorted_siloed_padded_data<let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
    ) {
        // Important note:
        // The reason we sort these side-effects by their counter is because we want the values in the output
        // to be in the same order as they were emitted.
        // E.g. Users who consume these logs might draw meaningful information from the ordering of events. A
        // different ordering and they might infer something different.
        // E.g. the ordering of defi actions might result in different tax treatment (a boring example, I know).

        // Notice: Each kind of side-effect is only sorted with other side-effects of the same kind.
        // This means we do lose information about the relative sorting of notes vs nullifiers vs logs.
        // (We also don't propagate the side-effect counters to public-land).
        // This is unfortunate, but intentional, and we'll see if users of the network find this limitation
        // to be problematic.
        // The reason we _don't_ combine the different kinds of side-effects into a single sorted list is
        // privacy: there are so many possible [note|nullifier|log] permutations that this information
        // would effectively become a fingerprint for the nature of the tx. An observer would be able to
        // infer with confidence which contracts have been executed and in what order.

        // note_hashes
        if NoteHashSiloingAmount == 0 {
            // No sorting or siloing or padding.
            assert_eq(
                self.output.end.note_hashes,
                self.squashed_output_array_hints.kept_note_hashes,
                "output note hashes mismatch",
            );
        } else {
            self.validate_sorted_siloed_unique_padded_note_hashes::<NoteHashSiloingAmount>();
        }

        // nullifiers
        if NullifierSiloingAmount == 0 {
            assert_eq(
                self.output.end.nullifiers,
                self.squashed_output_array_hints.kept_nullifiers,
                "output nullifiers mismatch",
            );
        } else {
            self.validate_sorted_siloed_padded_nullifiers::<NullifierSiloingAmount>();
        }

        // private_logs
        if PrivateLogSiloingAmount == 0 {
            assert_eq(
                self.output.end.private_logs,
                self.squashed_output_array_hints.kept_private_logs,
                "output private logs mismatch",
            );
        } else {
            self.validate_sorted_siloed_padded_private_logs::<PrivateLogSiloingAmount>();
        }
    }

    fn validate_sorted_siloed_unique_padded_note_hashes<let NoteHashSiloingAmount: u32>(self) {
        //---------------
        // Check that the values were not already siloed in a previous reset.

        // Note hashes need to be siloed all together because new note hashes added later might affect the ordering and
        // result in wrong note_nonces. I.e. we perform siloing only in the final Reset circuit of a tx, after all Init and
        // Inner and other Reset iterations (if applicable).

        // We only need to check the first item, since we always start siloing from index 0.
        // The first item should either be empty or not siloed (contract_address != 0).
        let first_note_hash = self.previous_kernel.end.note_hashes.array[0];
        assert(
            (self.previous_kernel.end.note_hashes.length == 0)
                | !first_note_hash.contract_address.is_zero(),
            "Note hashes have been siloed in a previous reset",
        );

        //---------------

        // Assign counter and contract address to the padding items.
        let note_hash_padding = self.padded_side_effects.note_hashes;

        let siloed_note_hash_padding = note_hash_padding.map(|value| {
            let (counter, contract_address) = if value != 0 {
                // A counter of MAX_U32_VALUE ensures padding is sorted to the right (below).
                // The masking address prevents these notes from belonging to a meaningful contract address.
                (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
            } else {
                (0, AztecAddress::zero())
            };
            Counted::new(value, counter).scope(contract_address)
        });

        //---------------
        // Sort, Silo, Unique-ify, Pad:

        // Check ordering and siloing.
        // TODO: because this is only called for one purpose (note hashes), consider not using the
        // lambda function, because it's hard to read.
        // Edit: oh, the nullifier and log paths also end up in this function too.
        assert_sorted_padded_transformed_i_array_capped_size::<_, _, _, _, NoteHashSiloingAmount>(
            self.squashed_output_array_hints.kept_note_hashes,
            siloed_note_hash_padding,
            self.output.end.note_hashes,
            |prev, out, index: u32| {
                assert_correctly_siloed_note_hash(
                    out.innermost(),
                    prev,
                    index,
                    self.output.claimed_first_nullifier,
                    self.output.is_private_only,
                    self.output.claimed_revertible_counter,
                );
                assert(out.contract_address.is_zero());
                // counter is checked in assert_sorted_padded_transformed_array_capped_size
            },
        );
    }

    fn validate_sorted_siloed_padded_nullifiers<let NullifierSiloingAmount: u32>(self) {
        // Check that the nullifiers were not already siloed in a previous reset.
        // We only need to check the first nullifier, since we always start siloing from index 0.
        // The first nullifier should not be siloed (i.e. contract_address != 0). It won't be empty because a protocol
        // nullifier will be created in the init circuit if no nullifiers are emitted throughout the private execution.
        let first_nullifier = self.previous_kernel.end.nullifiers.array[0];
        assert(
            (self.previous_kernel.end.nullifiers.length == 0)
                | !first_nullifier.contract_address.is_zero(),
            "Nullifiers have been siloed in a previous reset",
        );

        //---------------

        // Assign counter and contract address to the padded nullifiers.
        let nullifier_padding = self.padded_side_effects.nullifiers;
        let siloed_nullifier_padding = nullifier_padding.map(|value| {
            let (counter, contract_address) = if value != 0 {
                (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
            } else {
                (0, AztecAddress::zero())
            };
            Nullifier { value, note_hash: 0 }.count(counter).scope(contract_address)
        });

        //---------------
        // Sort, Silo, Pad:

        assert_sorted_padded_transformed_array_capped_size::<_, _, _, _, NullifierSiloingAmount>(
            self.squashed_output_array_hints.kept_nullifiers,
            siloed_nullifier_padding,
            self.output.end.nullifiers,
            |prev, out| {
                assert_eq(
                    out.innermost().value,
                    silo_nullifier(prev),
                    "Output nullifier does not match correctly-siloed nullifier",
                );
                assert_eq(
                    out.innermost().note_hash,
                    prev.innermost().note_hash,
                    "Linked note hash not copied correctly",
                );
                assert(
                    out.contract_address.is_zero(),
                    "The contract_address of a siloed nullified should be set to 0",
                );
                // counter is checked in assert_sorted_padded_transformed_array_capped_size
            },
        );
    }

    fn validate_sorted_siloed_padded_private_logs<let PrivateLogSiloingAmount: u32>(self) {
        // Check that the private logs were not already siloed in a previous reset.
        // We only need to check the first item, since we always start siloing from index 0.
        // The first item should either be empty or not siloed (contract_address != 0).
        let first_private_log = self.previous_kernel.end.private_logs.array[0];
        assert(
            (self.previous_kernel.end.private_logs.length == 0)
                | !first_private_log.contract_address.is_zero(),
            "Private logs have been siloed in a previous reset",
        );

        //---------------

        // Assign counter and contract address to the padded private logs.
        let log_padding = self.padded_side_effects.private_logs;
        let siloed_log_padding = log_padding.map(|log| {
            let (counter, contract_address) = if log.length != 0 {
                (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
            } else {
                (0, AztecAddress::zero())
            };
            PrivateLogData { log, note_hash_counter: 0 }.count(counter).scope(contract_address)
        });

        //---------------
        // Sort, Silo, Pad:

        assert_sorted_padded_transformed_array_capped_size::<_, _, _, _, PrivateLogSiloingAmount>(
            self.squashed_output_array_hints.kept_private_logs,
            siloed_log_padding,
            self.output.end.private_logs,
            |prev, out| {
                assert_valid_siloed_private_log(out.innermost().log, prev);
                assert_eq(out.innermost().note_hash_counter, prev.innermost().note_hash_counter);
                assert(out.contract_address.is_zero());
                // counter is checked in assert_sorted_padded_transformed_array_capped_size
            },
        );
    }
}

mod tests {
    use super::assert_correctly_siloed_note_hash;
    use types::{
        abis::note_hash::NoteHash,
        address::AztecAddress,
        hash::{compute_note_nonce_and_unique_note_hash, compute_siloed_note_hash},
        side_effect::{Counted, Scoped},
        traits::FromField,
    };

    global CONTRACT_ADDRESS: AztecAddress = AztecAddress::from_field(12345);
    global NOTE_HASH_VALUE: Field = 9999;
    global CLAIMED_FIRST_NULLIFIER: Field = 42;

    fn make_note_hash(value: Field, counter: u32) -> Scoped<Counted<NoteHash>> {
        Counted::new(value, counter).scope(CONTRACT_ADDRESS)
    }

    fn compute_expected_siloed(value: Field) -> Field {
        compute_siloed_note_hash(CONTRACT_ADDRESS, value)
    }

    fn compute_expected_unique(value: Field, index: u32) -> Field {
        let siloed = compute_expected_siloed(value);
        compute_note_nonce_and_unique_note_hash(siloed, CLAIMED_FIRST_NULLIFIER, index)
    }

    // ==================== Non-revertible tests ====================

    #[test]
    fn non_revertible_note_hash_uses_unique_siloed() {
        // counter (10) < min_revertible (100), so it's non-revertible
        let prev = make_note_hash(NOTE_HASH_VALUE, 10);
        let expected = compute_expected_unique(NOTE_HASH_VALUE, 0);

        assert_correctly_siloed_note_hash(
            expected,
            prev,
            0, // index
            CLAIMED_FIRST_NULLIFIER,
            false, // is_private_only
            100, // min_revertible_side_effect_counter
        );
    }

    #[test]
    fn non_revertible_at_boundary_counter_zero() {
        // counter (0) < min_revertible (100), so it's non-revertible
        let prev = make_note_hash(NOTE_HASH_VALUE, 0);
        let expected = compute_expected_unique(NOTE_HASH_VALUE, 5);

        assert_correctly_siloed_note_hash(expected, prev, 5, CLAIMED_FIRST_NULLIFIER, false, 100);
    }

    // ==================== Revertible with is_private_only=true ====================

    #[test]
    fn revertible_private_only_uses_unique_siloed() {
        // counter (200) >= min_revertible (100), so it's revertible
        // But is_private_only=true, so still uses unique
        let prev = make_note_hash(NOTE_HASH_VALUE, 200);
        let expected = compute_expected_unique(NOTE_HASH_VALUE, 3);

        assert_correctly_siloed_note_hash(
            expected,
            prev,
            3,
            CLAIMED_FIRST_NULLIFIER,
            true, // is_private_only
            100,
        );
    }

    // ==================== Revertible with is_private_only=false ====================

    #[test]
    fn revertible_with_public_uses_siloed_only() {
        // counter (200) >= min_revertible (100), so it's revertible
        // is_private_only=false, so uses siloed (not unique)
        let prev = make_note_hash(NOTE_HASH_VALUE, 200);
        let expected = compute_expected_siloed(NOTE_HASH_VALUE); // NOT unique!

        assert_correctly_siloed_note_hash(
            expected,
            prev,
            3,
            CLAIMED_FIRST_NULLIFIER,
            false, // is_private_only
            100,
        );
    }

    #[test]
    fn revertible_at_exact_boundary_uses_siloed_only() {
        // counter (100) == min_revertible (100), so it's revertible (not <)
        // is_private_only=false, so uses siloed (not unique)
        let prev = make_note_hash(NOTE_HASH_VALUE, 100);
        let expected = compute_expected_siloed(NOTE_HASH_VALUE);

        assert_correctly_siloed_note_hash(
            expected,
            prev,
            0,
            CLAIMED_FIRST_NULLIFIER,
            false,
            100, // counter == min_revertible
        );
    }

    // ==================== Zero contract_address (already siloed or empty) ====================

    #[test]
    fn zero_contract_address_passes_through_unchanged() {
        // When contract_address is zero, the value passes through unchanged
        let prev = Counted::new(NOTE_HASH_VALUE, 50).scope(AztecAddress::zero());

        assert_correctly_siloed_note_hash(
            NOTE_HASH_VALUE, // unchanged!
            prev,
            0,
            CLAIMED_FIRST_NULLIFIER,
            true,
            100,
        );
    }

    #[test]
    fn zero_contract_address_with_zero_value() {
        // Empty note hash: both address and value are zero
        let prev = Counted::new(0, 0).scope(AztecAddress::zero());

        assert_correctly_siloed_note_hash(
            0, // unchanged
            prev,
            0,
            CLAIMED_FIRST_NULLIFIER,
            false,
            100,
        );
    }

    // ==================== Index affects unique hash ====================

    #[test]
    fn different_indices_produce_different_unique_hashes() {
        let prev = make_note_hash(NOTE_HASH_VALUE, 10);
        let expected_at_0 = compute_expected_unique(NOTE_HASH_VALUE, 0);
        let expected_at_1 = compute_expected_unique(NOTE_HASH_VALUE, 1);

        // Verify they're different
        assert(expected_at_0 != expected_at_1);

        // Both should pass when given correct expected value
        assert_correctly_siloed_note_hash(
            expected_at_0,
            prev,
            0,
            CLAIMED_FIRST_NULLIFIER,
            true,
            100,
        );

        assert_correctly_siloed_note_hash(
            expected_at_1,
            prev,
            1,
            CLAIMED_FIRST_NULLIFIER,
            true,
            100,
        );
    }

    // ==================== First nullifier affects unique hash ====================

    #[test]
    fn different_first_nullifiers_produce_different_unique_hashes() {
        let prev = make_note_hash(NOTE_HASH_VALUE, 10);
        let siloed = compute_expected_siloed(NOTE_HASH_VALUE);

        let unique_with_nullifier_42 = compute_note_nonce_and_unique_note_hash(siloed, 42, 0);
        let unique_with_nullifier_99 = compute_note_nonce_and_unique_note_hash(siloed, 99, 0);

        // Verify they're different
        assert(unique_with_nullifier_42 != unique_with_nullifier_99);

        assert_correctly_siloed_note_hash(unique_with_nullifier_42, prev, 0, 42, true, 100);

        assert_correctly_siloed_note_hash(unique_with_nullifier_99, prev, 0, 99, true, 100);
    }

    // ==================== Failure cases ====================

    #[test(should_fail_with = "Output note hash does not match correctly-siloed note hash")]
    fn wrong_output_value_fails() {
        let prev = make_note_hash(NOTE_HASH_VALUE, 10);
        let wrong_output = 123456; // Not the correct siloed value

        assert_correctly_siloed_note_hash(
            wrong_output,
            prev,
            0,
            CLAIMED_FIRST_NULLIFIER,
            true,
            100,
        );
    }

    #[test(should_fail_with = "Output note hash does not match correctly-siloed note hash")]
    fn siloed_when_unique_expected_fails() {
        // Non-revertible expects unique, but we provide siloed
        let prev = make_note_hash(NOTE_HASH_VALUE, 10); // counter < 100, so non-revertible
        let siloed_only = compute_expected_siloed(NOTE_HASH_VALUE);

        assert_correctly_siloed_note_hash(
            siloed_only, // Wrong! Should be unique for non-revertible
            prev,
            0,
            CLAIMED_FIRST_NULLIFIER,
            false,
            100,
        );
    }

    #[test(should_fail_with = "Output note hash does not match correctly-siloed note hash")]
    fn unique_when_siloed_expected_fails() {
        // Revertible with public expects siloed, but we provide unique
        let prev = make_note_hash(NOTE_HASH_VALUE, 200); // counter >= 100, so revertible
        let unique = compute_expected_unique(NOTE_HASH_VALUE, 0);

        assert_correctly_siloed_note_hash(
            unique, // Wrong! Should be siloed-only for revertible with public
            prev,
            0,
            CLAIMED_FIRST_NULLIFIER,
            false, // is_private_only = false means public execution expected
            100,
        );
    }

    #[test(should_fail_with = "Output note hash does not match correctly-siloed note hash")]
    fn wrong_index_fails() {
        let prev = make_note_hash(NOTE_HASH_VALUE, 10);
        let expected_at_index_5 = compute_expected_unique(NOTE_HASH_VALUE, 5);

        assert_correctly_siloed_note_hash(
            expected_at_index_5,
            prev,
            0, // Wrong index! Expected was computed with index 5
            CLAIMED_FIRST_NULLIFIER,
            true,
            100,
        );
    }

    #[test(should_fail_with = "Output note hash does not match correctly-siloed note hash")]
    fn unsiloed_value_with_nonzero_contract_address_fails() {
        // If contract_address is non-zero, output must be siloed
        let prev = make_note_hash(NOTE_HASH_VALUE, 10);

        assert_correctly_siloed_note_hash(
            NOTE_HASH_VALUE, // Wrong! Should be siloed since contract_address != 0
            prev,
            0,
            CLAIMED_FIRST_NULLIFIER,
            true,
            100,
        );
    }
}
