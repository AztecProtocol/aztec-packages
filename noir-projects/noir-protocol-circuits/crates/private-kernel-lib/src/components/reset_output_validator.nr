use crate::{abis::PaddedSideEffects, components::reset_output_composer::ResetOutputHints};
use dep::reset_kernel_lib::{
    PrivateValidationRequestProcessor, TransientDataIndexHint, verify_squashed_transient_data,
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
    traits::Empty,
    utils::arrays::{
        assert_sorted_transformed_i_padded_array_capped_size,
        assert_sorted_transformed_padded_array_capped_size,
    },
};

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
    let computed_note_hash = if is_private_only
        | (prev.counter() < min_revertible_side_effect_counter) {
        unique_siloed_note_hash
    } else {
        // We don't silo revertible note hashes with a nonce, since we don't know their final position in the tx.
        // Padded note hashes have a counter of MAX_U32_VALUE and won't be siloed with a nonce either.
        siloed_note_hash
    };
    assert_eq(out_note_hash, computed_note_hash, "incorrect transformed value");
}

// Verifies that the first field of a private log is siloed with the contract address.
// Apps can define the meaning of the first field: it could be a tag, part of a tag, or a random value embedded in the
// content, etc.
// This siloing ensures that the log is verifiably linked to the specified contract address.
// Without this check, an app could impersonate another by emitting a log identical to one from a different contract
// or copying a tag from another contract while using entirely different content, potentially misleading the recipient.
fn assert_valid_siloed_private_log(out: PrivateLog, prev: Scoped<PrivateLogData>) -> () {
    let expected_first_field = if prev.contract_address.is_zero() {
        prev.inner.log.fields[0]
    } else {
        compute_siloed_private_log_field(prev.contract_address, prev.inner.log.fields[0])
    };
    assert_eq(out.fields[0], expected_first_field);
    for i in 0..out.fields.len() {
        assert_eq(out.fields[i], prev.inner.log.fields[i]);
    }

    assert_eq(out.length, prev.inner.log.length);
}

pub struct ResetOutputValidator<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_HINTS_LEN: u32, let TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32> {
    output: PrivateKernelCircuitPublicInputs,
    previous_kernel: PrivateKernelCircuitPublicInputs,
    validation_request_processor: PrivateValidationRequestProcessor<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN>,
    transient_data_index_hints: [TransientDataIndexHint; TRANSIENT_DATA_SQUASHING_HINTS_LEN],
    transient_data_squashing_amount: u32,
    note_hash_siloing_amount: u32,
    nullifier_siloing_amount: u32,
    private_log_siloing_amount: u32,
    padded_side_effects: PaddedSideEffects,
    hints: ResetOutputHints,
}

impl<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_HINTS_LEN: u32, let TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32> ResetOutputValidator<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN> {
    pub fn new(
        output: PrivateKernelCircuitPublicInputs,
        previous_kernel: PrivateKernelCircuitPublicInputs,
        validation_request_processor: PrivateValidationRequestProcessor<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN>,
        transient_data_index_hints: [TransientDataIndexHint; TRANSIENT_DATA_SQUASHING_HINTS_LEN],
        transient_data_squashing_amount: u32,
        note_hash_siloing_amount: u32,
        nullifier_siloing_amount: u32,
        private_log_siloing_amount: u32,
        padded_side_effects: PaddedSideEffects,
        hints: ResetOutputHints,
    ) -> Self {
        ResetOutputValidator {
            output,
            previous_kernel,
            validation_request_processor,
            transient_data_index_hints,
            transient_data_squashing_amount,
            note_hash_siloing_amount,
            nullifier_siloing_amount,
            private_log_siloing_amount,
            padded_side_effects,
            hints,
        }
    }

    pub fn validate(self) {
        self.validate_unchanged_data();

        self.validation_request_processor.validate(self.output.validation_requests);

        // Validates that the hinted 'kept' arrays are correctly computed, by taking the
        // previous kernel's arrays and asserting that transient notes have been correctly splice-removed.
        self.validate_transient_data();

        // Validates that the hinted output arrays are correctly sorted, siloed, and padded, by taking the
        // (now-validated-to-be-correct) hinted 'kept' arrays and asserting that transformations
        // from the hinted 'kept' arrays result in the hinted output arrays.
        self.validate_sorted_siloed_data();
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
    }

    fn validate_transient_data(self) {
        if self.transient_data_squashing_amount == 0 {
            let kept = self.hints.kept_note_hashes;
            let prev = self.previous_kernel.end.note_hashes;
            println(f"KEPT: {kept}");
            println(f"PREV: {prev}");
            assert_eq(
                self.hints.kept_note_hashes,
                self.previous_kernel.end.note_hashes,
                "mismatch kept note hashes",
            );
            assert_eq(
                self.hints.kept_nullifiers,
                self.previous_kernel.end.nullifiers,
                "mismatch kept nullifiers",
            );
            assert_eq(
                self.hints.kept_private_logs,
                self.previous_kernel.end.private_logs,
                "mismatch kept private logs",
            );
        } else {
            verify_squashed_transient_data(
                self.previous_kernel.end.note_hashes,
                self.previous_kernel.end.nullifiers,
                self.previous_kernel.end.private_logs,
                self.hints.kept_note_hashes,
                self.hints.kept_nullifiers,
                self.hints.kept_private_logs,
                self.transient_data_index_hints,
                self.hints.transient_or_propagated_note_hash_index_for_each_log,
                self.output.validation_requests.split_counter.unwrap_unchecked(),
            );
        }
    }

    fn validate_sorted_siloed_data(self) {
        // note_hashes
        if self.note_hash_siloing_amount == 0 {
            // No sorting or siloing or padding.
            assert_eq(
                self.output.end.note_hashes,
                self.hints.kept_note_hashes,
                "output note hashes mismatch",
            );
        } else {
            self.validate_sorted_siloed_unique_padded_note_hashes();
        }

        // nullifiers
        if self.nullifier_siloing_amount == 0 {
            assert_eq(
                self.output.end.nullifiers,
                self.hints.kept_nullifiers,
                "output nullifiers mismatch",
            );
        } else {
            self.validate_sorted_siloed_padded_nullifiers();
        }

        // private_logs
        if self.private_log_siloing_amount == 0 {
            assert_eq(
                self.output.end.private_logs,
                self.hints.kept_private_logs,
                "output private logs mismatch",
            );
        } else {
            self.validate_sorted_siloed_padded_private_logs();
        }
    }

    fn validate_sorted_siloed_unique_padded_note_hashes(self) {
        //---------------
        // Check that the values were not already siloed in a previous reset.

        // Q: why don't we just propagate a bool with each note_hash which tells us
        // whether or not it's already been siloed?

        // Note hashes need to be siloed all together because new note hashes added later might affect the ordering and result in wrong nonces.
        // We only need to check the first item, since we always start siloing from index 0.
        // The first item should either be empty or not siloed (contract_address != 0).
        let note_hash = self.previous_kernel.end.note_hashes.array[0];

        // TODO: looks like this line can be optimised.
        // assert(
        //     note_hash.is_empty() | !note_hash.contract_address.is_zero(),
        //     "note hashes have been siloed in a previous reset",
        // );
        // Maybe this is an optimisation. Keeping the one above until someone looks at it.
        if (note_hash.contract_address.is_zero()) {
            note_hash.assert_empty("note hashes have been siloed in a previous reset");
        }

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
        assert_sorted_transformed_i_padded_array_capped_size(
            self.hints.kept_note_hashes,
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
            self.hints.sorted_kept_note_hash_indexes,
            self.note_hash_siloing_amount, // TODO: consider making this a generic param of the circuit.
        );
    }

    fn validate_sorted_siloed_padded_nullifiers(self) {
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

        assert_sorted_transformed_padded_array_capped_size(
            self.hints.kept_nullifiers,
            padded_nullifiers,
            self.output.end.nullifiers,
            |prev: ScopedNullifier, out: ScopedNullifier| {
                let out_val = out.value();
                let prev_val = silo_nullifier(prev);
                println(f"out_val: {out_val}");
                println(f"prev_val: {prev_val}");
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
            self.hints.sorted_kept_nullifier_indexes,
            self.nullifier_siloing_amount,
        );
    }

    fn validate_sorted_siloed_padded_private_logs(self) {
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

        assert_sorted_transformed_padded_array_capped_size(
            self.hints.kept_private_logs,
            padded_logs,
            self.output.end.private_logs,
            |prev: Scoped<PrivateLogData>, out: Scoped<PrivateLogData>| {
                assert_valid_siloed_private_log(out.inner.log, prev);
                assert_eq(out.inner.note_hash_counter, prev.inner.note_hash_counter);
                assert(out.contract_address.is_zero());
                // counter is checked in assert_sorted_transformed_padded_array_capped_size
            },
            self.hints.sorted_kept_private_log_indexes,
            self.private_log_siloing_amount,
        );
    }
}
