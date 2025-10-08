mod validate_note_logs_linked_to_note_hashes;

use crate::{
    abis::{PaddedSideEffects, PrivateKernelResetHints},
    components::reset_output_composer::ResetOutputHints,
    reset::{KeyValidationRequestsValidator, ReadRequestValidator, TransientDataValidator},
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        note_hash::{NoteHash, ScopedNoteHash},
        nullifier::{Nullifier, ScopedNullifier},
        private_log::{PrivateLog, PrivateLogData},
        side_effect::{Ordered, OrderedValue, scoped::Scoped},
    },
    address::AztecAddress,
    constants::{MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS},
    hash::{
        compute_nonce_and_unique_note_hash, compute_siloed_note_hash,
        compute_siloed_private_log_field, silo_nullifier,
    },
    utils::arrays::{
        assert_sorted_transformed_i_padded_array_capped_size,
        assert_sorted_transformed_padded_array_capped_size,
    },
};
use validate_note_logs_linked_to_note_hashes::validate_note_logs_linked_to_note_hashes;

fn assert_correctly_siloed_note_hash(
    out_note_hash: Field,
    prev: ScopedNoteHash,
    index: u32,
    claimed_first_nullifier: Field,
    is_private_only: bool,
    min_revertible_side_effect_counter: u32,
) {
    let (siloed_note_hash, unique_siloed_note_hash) = if prev.contract_address.is_zero() {
        (prev.value(), prev.value())
    } else {
        let siloed = compute_siloed_note_hash(prev.contract_address, prev.value());
        let unique = compute_nonce_and_unique_note_hash(siloed, claimed_first_nullifier, index);
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
        // Revertible note hashes are not siloed with a nonce if public execution will occur later
        // (i.e., `is_private_only` == false). This is because additional non-revertible note hashes may be added during
        // public execution, making the final position of the revertible note hashes from private execution uncertain
        // at this point.
        //
        // Note: padded note hashes have a counter of `MAX_U32_VALUE`, which is always greater than
        // `min_revertible_side_effect_counter`, so they are also not siloed with a nonce.
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
fn assert_valid_siloed_private_log(out: PrivateLog, prev: Scoped<PrivateLogData>) -> () {
    // Q: is checking `if prev.contract_address.is_zero()` being used to mean "if the prev is empty"?
    let expected_first_field = if prev.contract_address.is_zero() {
        prev.inner.log.fields[0]
    } else {
        compute_siloed_private_log_field(prev.contract_address, prev.inner.log.fields[0])
    };
    assert_eq(out.fields[0], expected_first_field);
    for i in 1..out.fields.len() {
        assert_eq(out.fields[i], prev.inner.log.fields[i]);
    }

    assert_eq(out.length, prev.inner.log.length);
}

pub struct ResetOutputValidator<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> {
    output: PrivateKernelCircuitPublicInputs,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    padded_side_effects: PaddedSideEffects,
    reset_hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
    output_hints: ResetOutputHints,
}

impl<let NoteHashPendingReadHintsLen: u32, let NoteHashSettledReadHintsLen: u32, let NullifierPendingReadHintsLen: u32, let NullifierSettledReadHintsLen: u32, let KeyValidationHintsLen: u32, let TransientDataSquashingHintsLen: u32> ResetOutputValidator<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen> {
    pub fn new(
        output: PrivateKernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        padded_side_effects: PaddedSideEffects,
        reset_hints: PrivateKernelResetHints<NoteHashPendingReadHintsLen, NoteHashSettledReadHintsLen, NullifierPendingReadHintsLen, NullifierSettledReadHintsLen, KeyValidationHintsLen, TransientDataSquashingHintsLen>,
        output_hints: ResetOutputHints,
    ) -> Self {
        ResetOutputValidator {
            output,
            previous_kernel,
            padded_side_effects,
            reset_hints,
            output_hints,
        }
    }

    pub fn validate<let NoteHashPendingReadAmount: u32, let NoteHashSettledReadAmount: u32, let NullifierPendingReadAmount: u32, let NullifierSettledReadAmount: u32, let KeyValidationAmount: u32, let TransientDataSquashingAmount: u32, let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
    ) {
        self.validate_unchanged_data();

        self
            .validate_validation_requests::<NoteHashPendingReadAmount, NoteHashSettledReadAmount, NullifierPendingReadAmount, NullifierSettledReadAmount, KeyValidationAmount>();

        // Validates that the hinted 'kept' arrays are correctly computed, by taking the
        // previous kernel's arrays and asserting that transient notes have been correctly splice-removed.
        self.validate_transient_data::<TransientDataSquashingAmount>();

        // Validates that note logs (where log.note_hash_counter != 0) are correctly linked to existing note hashes.
        if TransientDataSquashingAmount == 0 {
            // The following check is unnecessary if there is transient data to be squashed
            // (i.e. `TransientDataSquashingAmount` != 0),
            // because `validate_transient_data -> validate_squashed_transient_data` will be called,
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
            .validate_sorted_siloed_data::<NoteHashSiloingAmount, NullifierSiloingAmount, PrivateLogSiloingAmount>();
    }

    fn validate_unchanged_data(self) {
        assert_eq(self.output.is_private_only, self.previous_kernel.is_private_only);
        assert_eq(
            self.output.claimed_first_nullifier,
            self.previous_kernel.claimed_first_nullifier,
        );
        assert_eq(self.output.constants, self.previous_kernel.constants);

        assert_eq(
            self.output.min_revertible_side_effect_counter,
            self.previous_kernel.min_revertible_side_effect_counter,
        );

        assert_eq(
            self.output.public_teardown_call_request,
            self.previous_kernel.public_teardown_call_request,
        );

        assert_eq(self.output.fee_payer, self.previous_kernel.fee_payer);

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

        // split_counter
        let counter_hint = self.reset_hints.min_revertible_side_effect_counter;
        // `counter_hint` is provided as a hint via private inputs, while
        // `validation_requests.split_counter` is the value maintained within `validation_requests`.
        //
        // The hint is necessary because `min_revertible_side_effect_counter` may not yet be set when a reset is
        // executed. In such cases, we supply the expected `min_revertible_side_effect_counter` via private inputs and
        // initialize `validation_requests.split_counter` to match it.
        //
        // When `validation_requests.split_counter` from the previous kernel is `Some`, it indicates that a reset has
        // already occurred. At this point, we must ensure that the previously supplied hint remains consistent with the
        // current hint.
        //
        // Later, in the private tail, the split counter will be checked against the actual
        // `min_revertible_side_effect_counter`, which is guaranteed to be set when the tail is executed.
        assert_eq(
            self.output.validation_requests.split_counter.unwrap(),
            counter_hint,
            "Mismatch validation request split counter",
        );
        if self.previous_kernel.validation_requests.split_counter.is_some() {
            assert_eq(
                self.previous_kernel.validation_requests.split_counter.unwrap_unchecked(),
                counter_hint,
                "Mismatch hinted validation request split counter",
            );
        }
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
            propagated_requests: output.scoped_key_validation_requests_and_generators,
            hints: self.reset_hints.key_validation_hints,
        }
            .validate::<KeyValidationAmount>();
    }

    fn validate_transient_data<let TransientDataSquashingAmount: u32>(self) {
        if TransientDataSquashingAmount == 0 {
            assert_eq(
                self.output_hints.kept_note_hashes,
                self.previous_kernel.end.note_hashes,
                "mismatch kept note hashes",
            );
            assert_eq(
                self.output_hints.kept_nullifiers,
                self.previous_kernel.end.nullifiers,
                "mismatch kept nullifiers",
            );
            assert_eq(
                self.output_hints.kept_private_logs,
                self.previous_kernel.end.private_logs,
                "mismatch kept private logs",
            );
        } else {
            TransientDataValidator::new(
                self.previous_kernel.end.note_hashes,
                self.previous_kernel.end.nullifiers,
                self.previous_kernel.end.private_logs,
                self.output_hints.kept_note_hashes,
                self.output_hints.kept_nullifiers,
                self.output_hints.kept_private_logs,
                self.output.validation_requests.split_counter.unwrap_unchecked(),
                self.reset_hints.transient_data_squashing_hints,
            )
                .validate();
        }
    }

    fn validate_sorted_siloed_data<let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32>(
        self,
    ) {
        // note_hashes
        if NoteHashSiloingAmount == 0 {
            // No sorting or siloing or padding.
            assert_eq(
                self.output.end.note_hashes,
                self.output_hints.kept_note_hashes,
                "output note hashes mismatch",
            );
        } else {
            self.validate_sorted_siloed_unique_padded_note_hashes::<NoteHashSiloingAmount>();
        }

        // nullifiers
        if NullifierSiloingAmount == 0 {
            assert_eq(
                self.output.end.nullifiers,
                self.output_hints.kept_nullifiers,
                "output nullifiers mismatch",
            );
        } else {
            self.validate_sorted_siloed_padded_nullifiers::<NullifierSiloingAmount>();
        }

        // private_logs
        if PrivateLogSiloingAmount == 0 {
            assert_eq(
                self.output.end.private_logs,
                self.output_hints.kept_private_logs,
                "output private logs mismatch",
            );
        } else {
            self.validate_sorted_siloed_padded_private_logs::<PrivateLogSiloingAmount>();
        }
    }

    fn validate_sorted_siloed_unique_padded_note_hashes<let NoteHashSiloingAmount: u32>(self) {
        //---------------
        // Check that the values were not already siloed in a previous reset.

        // Q: why don't we just propagate a bool with each note_hash which tells us
        // whether or not it's already been siloed?

        // Note hashes need to be siloed all together because new note hashes added later might affect the ordering and
        // result in wrong nonces.
        // We only need to check the first item, since we always start siloing from index 0.
        // The first item should either be empty or not siloed (contract_address != 0).
        let first_note_hash = self.previous_kernel.end.note_hashes.array[0];
        assert(
            (self.previous_kernel.end.note_hashes.length == 0)
                | !first_note_hash.contract_address.is_zero(),
            "Note hashes have been siloed in a previous reset",
        );

        //---------------

        // Assign counter and contract address to the padded note hashes.
        // TODO: It's a confusing name, because English is stupid. "padded_note_hashes"
        // can be misinterpreted to mean an array of all note hashes with padding at the end.
        // But what it actually is is solely the padding items.
        // Maybe all "padded" words should be changed to "padding" (but the names would need extra
        // tweaks to make "padding" make sense). It is _padding_; it is not something that has been padded.
        // Hmm, but "padding note hash" isn't clear either.
        // Dummy note hash? Eurgh.
        let padded_note_hash_hints = self.padded_side_effects.note_hashes;

        // Q: Why are we computing these scoped padded note hashes, when we already
        // computed them in reset_output_composer.nr?
        // They're already a part of `output.end.note_hashes`
        let padded_scoped_note_hashes = padded_note_hash_hints.map(|value| {
            let (counter, contract_address) = if value != 0 {
                (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
            } else {
                (0, AztecAddress::zero()) // Q: can't we assert zero, instead of assign zero?
            };
            NoteHash { value, counter }.scope(contract_address)
        });

        //---------------
        // Sort, Silo, Unique-ify, Pad:

        // Check ordering and siloing.
        // TODO: because this is only called for one purpose (note hashes), consider not using the
        // lambda function, because it's hard to read.
        // Edit: oh, the nullifier and log paths also end up in this function too.
        assert_sorted_transformed_i_padded_array_capped_size::<_, _, _, _, NoteHashSiloingAmount>(
            self.output_hints.kept_note_hashes,
            padded_scoped_note_hashes,
            self.output.end.note_hashes,
            |prev: ScopedNoteHash, out: ScopedNoteHash, index: u32| {
                assert_correctly_siloed_note_hash(
                    out.value(),
                    prev,
                    index,
                    self.output.claimed_first_nullifier,
                    self.output.is_private_only,
                    self.output.min_revertible_side_effect_counter,
                );
                assert(out.contract_address.is_zero());
            },
            self.output_hints.sorted_kept_note_hash_indexes,
        );
    }

    fn validate_sorted_siloed_padded_nullifiers<let NullifierSiloingAmount: u32>(self) {
        // Unlike note hashes, we don't have to check that the nullifiers haven't been siloed.
        // silo_nullifier() will return the already-siloed value if contract address is zero.
        // Q: why isn't it the same flow for note_hashes?

        //---------------

        // Assign counter and contract address to the padded nullifiers.
        let padded_values = self.padded_side_effects.nullifiers;
        let padded_nullifiers = padded_values.map(|value| {
            let (counter, contract_address) = if value != 0 {
                (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
            } else {
                (0, AztecAddress::zero())
            };
            Nullifier { value, counter, note_hash: 0 }.scope(contract_address)
        });

        //---------------
        // Sort, Silo, Pad:

        assert_sorted_transformed_padded_array_capped_size::<_, _, _, _, NullifierSiloingAmount>(
            self.output_hints.kept_nullifiers,
            padded_nullifiers,
            self.output.end.nullifiers,
            |prev: ScopedNullifier, out: ScopedNullifier| {
                assert_eq(
                    out.value(),
                    silo_nullifier(prev),
                    "Output nullifier does not match correctly-siloed nullifier",
                );
                assert_eq(
                    out.nullifier.note_hash,
                    prev.nullifier.note_hash,
                    "Linked note hash not copied correctly",
                );
                assert(
                    out.contract_address.is_zero(),
                    "The contract_address of a siloed nullified should be set to 0",
                );
                // counter is checked in assert_sorted_transformed_padded_array_capped_size
            },
            self.output_hints.sorted_kept_nullifier_indexes,
        );
    }

    fn validate_sorted_siloed_padded_private_logs<let PrivateLogSiloingAmount: u32>(self) {
        // Unlike note hashes, we don't have to check that the private logs haven't been siloed.
        // silo_private_log() will return the already-siloed value if contract address is zero.

        //---------------

        // Assign counter and contract address to the padded private logs.
        let padded_values = self.padded_side_effects.private_logs;
        let padded_logs = padded_values.map(|log| {
            let (counter, contract_address) = if log.length != 0 {
                (MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS)
            } else {
                (0, AztecAddress::zero())
            };
            PrivateLogData { log, counter, note_hash_counter: 0 }.scope(contract_address)
        });

        //---------------
        // Sort, Silo, Pad:

        assert_sorted_transformed_padded_array_capped_size::<_, _, _, _, PrivateLogSiloingAmount>(
            self.output_hints.kept_private_logs,
            padded_logs,
            self.output.end.private_logs,
            |prev: Scoped<PrivateLogData>, out: Scoped<PrivateLogData>| {
                assert_valid_siloed_private_log(out.inner.log, prev);
                assert_eq(out.inner.note_hash_counter, prev.inner.note_hash_counter);
                assert(out.contract_address.is_zero());
                // counter is checked in assert_sorted_transformed_padded_array_capped_size
            },
            self.output_hints.sorted_kept_private_log_indexes,
        );
    }
}
