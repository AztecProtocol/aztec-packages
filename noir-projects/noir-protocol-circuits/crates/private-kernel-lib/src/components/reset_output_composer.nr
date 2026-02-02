pub mod reset_output_hints;

pub use reset_output_hints::SquashedOutputArrayHints;

use crate::{
    abis::PaddedSideEffects,
    accumulated_data::{check_padded_items, sort_by_counter},
    components::reset_output_composer::reset_output_hints::generate_squashed_output_array_hints,
    reset::{
        get_propagated_key_validation_requests, get_propagated_read_requests, ReadRequestAction,
        TransientDataSquashingHint,
    },
};
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, note_hash::NoteHash,
        nullifier::Nullifier, private_log::PrivateLogData,
        validation_requests::PrivateValidationRequests,
    },
    address::AztecAddress,
    constants::{
        MAX_NOTE_HASH_READ_REQUESTS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_U32_VALUE, SIDE_EFFECT_MASKING_ADDRESS,
    },
    hash::{compute_unique_siloed_note_hash, silo_note_hash, silo_nullifier, silo_private_log},
    side_effect::{Counted, Scoped},
    utils::arrays::ClaimedLengthArray,
};

pub struct ResetOutputComposer {
    pub previous_kernel: PrivateKernelCircuitPublicInputs,
    pub padded_side_effects: PaddedSideEffects,
    pub note_hash_read_request_actions_hints: [ReadRequestAction; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
    pub nullifier_read_request_actions_hints: [ReadRequestAction; MAX_NULLIFIER_READ_REQUESTS_PER_TX],
    pub squashed_output_array_hints: SquashedOutputArrayHints,
}

impl ResetOutputComposer {
    pub unconstrained fn new<let TransientDataSquashingHintsLen: u32>(
        previous_kernel: PrivateKernelCircuitPublicInputs,
        padded_side_effects: PaddedSideEffects,
        transient_data_squashing_hints: [TransientDataSquashingHint; TransientDataSquashingHintsLen],
        note_hash_read_request_actions_hints: [ReadRequestAction; MAX_NOTE_HASH_READ_REQUESTS_PER_TX],
        nullifier_read_request_actions_hints: [ReadRequestAction; MAX_NULLIFIER_READ_REQUESTS_PER_TX],
    ) -> Self {
        // We splice-remove some transient note_hashes, nullifiers, and private logs from the previous
        // kernel's arrays.
        // The result is so-called "kept" arrays - arrays containing side-effects which will NOT
        // be removed by this circuit, but which will be propagated to some later instance of the
        // reset circuit.
        let squashed_output_array_hints =
            generate_squashed_output_array_hints(previous_kernel, transient_data_squashing_hints);

        ResetOutputComposer {
            previous_kernel,
            padded_side_effects,
            note_hash_read_request_actions_hints,
            nullifier_read_request_actions_hints,
            squashed_output_array_hints,
        }
    }

    pub unconstrained fn finish<let NoteHashSiloingAmount: u32, let NullifierSiloingAmount: u32, let PrivateLogSiloingAmount: u32, let KeyValidationAmount: u32>(
        self,
    ) -> PrivateKernelCircuitPublicInputs {
        let mut output = self.previous_kernel;

        // The "propagated" validation requests (read requests & key validation requests)
        // whose processing will be deferred to later Reset circuit iterations.
        output.validation_requests =
            self.get_propagated_validation_requests::<KeyValidationAmount>();

        // Before we propagate new side-effects (new notes, nullifiers, private logs), we might be in
        // the final reset circuit, in which case we'll also "silo" all of them, and then "pad" them
        // with random-looking dummy fields for better privacy.
        // "Siloing" is the act of hashing the side-effect with the contract_address which emitted
        // it, effectively "siloing" one contract's state and logs from another's, to prevent
        // cross-contamination.
        output.end.note_hashes = if NoteHashSiloingAmount == 0 {
            // Some transient note_hashes have been removed (squashed).
            self.squashed_output_array_hints.kept_note_hashes
        } else {
            self.get_padded_unique_siloed_sorted_kept_note_hashes::<NoteHashSiloingAmount>()
        };

        output.end.nullifiers = if NullifierSiloingAmount == 0 {
            // Some transient nullifiers have been removed (squashed).
            self.squashed_output_array_hints.kept_nullifiers
        } else {
            self.get_padded_siloed_sorted_kept_nullifiers::<NullifierSiloingAmount>()
        };

        output.end.private_logs = if PrivateLogSiloingAmount == 0 {
            // The logs of transient notes have been removed (squashed).
            self.squashed_output_array_hints.kept_private_logs
        } else {
            self.get_padded_siloed_sorted_kept_private_logs::<PrivateLogSiloingAmount>()
        };

        output
    }

    unconstrained fn get_propagated_validation_requests<let KeyValidationAmount: u32>(
        self,
    ) -> PrivateValidationRequests {
        let validation_requests = self.previous_kernel.validation_requests;

        let kept_note_hash_read_requests = get_propagated_read_requests(
            validation_requests.note_hash_read_requests,
            self.note_hash_read_request_actions_hints,
        );

        let kept_nullifier_read_requests = get_propagated_read_requests(
            validation_requests.nullifier_read_requests,
            self.nullifier_read_request_actions_hints,
        );

        let scoped_key_validation_requests_and_generators = get_propagated_key_validation_requests(
            validation_requests.scoped_key_validation_requests_and_generators,
            KeyValidationAmount,
        );

        PrivateValidationRequests {
            note_hash_read_requests: kept_note_hash_read_requests,
            nullifier_read_requests: kept_nullifier_read_requests,
            scoped_key_validation_requests_and_generators,
        }
    }

    unconstrained fn get_padded_unique_siloed_sorted_kept_note_hashes<let NoteHashSiloingAmount: u32>(
        self,
    ) -> ClaimedLengthArray<Scoped<Counted<NoteHash>>, MAX_NOTE_HASHES_PER_TX> {
        // Sort:
        let sorted_kept_note_hashes = ClaimedLengthArray {
            array: sort_by_counter(self.squashed_output_array_hints.kept_note_hashes.array),
            length: self.squashed_output_array_hints.kept_note_hashes.length,
        };
        let num_kept_note_hashes = sorted_kept_note_hashes.length;
        let padded_note_hashes = self.padded_side_effects.note_hashes;

        // Calling this in the unconstrained context is not a problem. Since it doesn't matter if there are non-empty
        // items outside of the range [num_kept_note_hashes, NoteHashSiloingAmount). The values will simply be ignored.
        // Having the check here is useful to catch any bugs where the padded values are not configured correctly by mistake.
        check_padded_items(
            padded_note_hashes,
            num_kept_note_hashes,
            NoteHashSiloingAmount,
        );

        let mut padded_unique_siloed_sorted_kept_note_hashes = sorted_kept_note_hashes;

        for i in 0..sorted_kept_note_hashes.array.len() {
            // Push padding:
            if (i >= num_kept_note_hashes)
                // We only apply padding if the executor of this circuit provides padding as input:
                & (padded_note_hashes[i] != 0) {
                // We 'push' so that the length increments.
                // Note: beyond `NoteHashSiloingAmount`, these so-called "padded" note_hashes
                // will be empty, because we just called `check_padded_items`.
                // I.e. we don't pad 64; it depends on the dimensions
                // of this variant of the reset circuit.
                padded_unique_siloed_sorted_kept_note_hashes.push(Counted::new(
                    padded_note_hashes[i],
                    MAX_U32_VALUE, // A dummy, revertible counter.
                )
                // We "silo" the padding with this dummy address. This ensures an attacker cannot
                // abuse this padding feature to push state for meaningful contract addresses.
                // (E.g. we don't want an attacker to create $1bn in notes for a popular token
                // contract by pushing padding through this Reset Kernel circuit!!!)
                .scope(SIDE_EFFECT_MASKING_ADDRESS));
            }

            // Silo:
            let note_hash = padded_unique_siloed_sorted_kept_note_hashes.array[i];
            let siloed_note_hash = silo_note_hash(note_hash);

            // Unique:
            let unique_siloed_note_hash = compute_unique_siloed_note_hash(
                siloed_note_hash,
                self.previous_kernel.claimed_first_nullifier,
                i,
            );

            // We don't silo revertible note hashes with a note_nonce, since we don't know their final position in the tx.
            //
            // Elaboration:
            //
            // If this tx makes public function calls, then all notes and nullifiers will be inserted
            // within the AVM circuit instead of the rollup-tx-base-private circuit. Unlike private
            // function execution, public function execution can revert because those functions are
            // executed in a VM. If a public function reverts, then all revertible side-effects of
            // the tx (from both private and public functions) are reverted and are never inserted
            // into trees. All non-revertible side-effects are still inserted into the trees.
            //
            // Aside: the reason we even have non-revertible side-effects is because of
            // fee abstraction. If a fee-payment pattern creates state representing payment to a
            // "Fee-Payment Contract" ("FPC") (an entity willing to pay the fee on a user's behalf, kind of
            // like a paymaster), then we need that state to be included regardless of whether the
            // tx succeeds or reverts. We label such state as "non-revertible".
            //
            // Non-revertible side-effects are delineated by having a side-effect counter which is less
            // than the tx's `min_revertible_side_effect_counter`. (The `min_revertible_side_effect_counter`
            // is chosen by one (and only one) function of a tx; probably the FPC).
            // Revertible side-effects are delineated by having a side-effect counter which is
            // greater than the tx's `min_revertible_side_effect_counter`.
            //
            // So in the case of a tx which makes public function calls, we have these kinds of
            // side-effects that the AVM needs to insert:
            // - non-revertible from private-land
            // - revertible from private-land
            // - non-revertible from public-land
            // - revertible from public-land
            //
            // The AVM does its insertions in this order:
            // - non-revertible from private-land
            // - non-revertible from public-land
            // - revertible from private-land
            // - revertible from public-land
            //
            // This enables it to insert non-revertible side-effects immediately, before embarking
            // on executing any public functions (which might revert).
            //
            // This means the "revertible from private-land" note_hashes cannot be made unique in
            // private-land, since the uniqueness can only be derived in public-land, because the
            // revertible notes' indices (within the note_hashes of the tx) will only be known in
            // public-land. See `compute_unique_siloed_note_hash` for more explanation on how the
            // uniqueness (aka note_nonce) is derived.
            //
            // In summary:
            // - If the tx `is_private_only`, then we can derive the uniqueness for all note_hashes, and
            //   the `unique_siloed_note_hash` that we derived above are correct.
            // - If the tx makes public function calls:
            //   - For "non-revertible from private-land" note hashes, the `unique_siloed_note_hash`es
            //     that we derived above are correct.
            //   - None of the `unique_siloed_note_hash`es for "revertible" note hashes are fit for use.
            let is_non_revertible = note_hash.is_non_revertible(
                self.previous_kernel.is_private_only,
                self.previous_kernel.claimed_revertible_counter,
            );

            padded_unique_siloed_sorted_kept_note_hashes.array[i].inner.inner = if is_non_revertible {
                unique_siloed_note_hash
            } else {
                siloed_note_hash
            };

            // Why is it doing this? Is the contract_address being overloaded to mean something else?
            // Oh, is it being used to say "This has already been siloed"?
            // TODO: Why not use an extra bool to convey that?
            // A contract address will be assigned to the padding within constrained-land (see validate_sorted_siloed_unique_padded_note_hashes).
            padded_unique_siloed_sorted_kept_note_hashes.array[i].contract_address =
                AztecAddress::zero();
        }
        padded_unique_siloed_sorted_kept_note_hashes
    }

    unconstrained fn get_padded_siloed_sorted_kept_nullifiers<let NullifierSiloingAmount: u32>(
        self,
    ) -> ClaimedLengthArray<Scoped<Counted<Nullifier>>, MAX_NULLIFIERS_PER_TX> {
        // Sort:
        let sorted_kept_nullifiers = ClaimedLengthArray {
            array: sort_by_counter(self.squashed_output_array_hints.kept_nullifiers.array),
            length: self.squashed_output_array_hints.kept_nullifiers.length,
        };

        let num_kept_nullifiers = sorted_kept_nullifiers.length;
        let padded_nullifiers = self.padded_side_effects.nullifiers;

        // Calling this in the unconstrained context is not a problem. Since it doesn't matter if there are non-empty
        // items outside of the range [num_nullifiers, NullifierSiloingAmount). The values will simply be ignored.
        // Having the check here is useful to catch any bugs where the padded values are not configured correctly by mistake.
        check_padded_items(
            padded_nullifiers,
            num_kept_nullifiers,
            NullifierSiloingAmount,
        );

        let mut padded_siloed_sorted_kept_nullifiers = sorted_kept_nullifiers;

        for i in 0..sorted_kept_nullifiers.array.len() {
            // Push padding:
            if (i >= num_kept_nullifiers)
                // we only apply padding if the executor of this circuit provides padding as input:
                & (padded_nullifiers[i] != 0) {
                padded_siloed_sorted_kept_nullifiers.push(Nullifier {
                    value: padded_nullifiers[i],
                    note_hash: 0,
                }
                    .count(MAX_U32_VALUE) // A dummy, revertible counter.
                    // We "silo" the padding with this dummy address. This ensures an attacker cannot
                    // abuse this padding feature to push nullifiers for meaningful contract addresses.
                    // (E.g. we don't want an attacker to be able to spend (nullify) other people's
                    // money by pushing padding through this Reset Kernel circuit!!!)
                    .scope(SIDE_EFFECT_MASKING_ADDRESS));
            }

            // Silo:
            padded_siloed_sorted_kept_nullifiers.array[i].inner.inner.value =
                silo_nullifier(padded_siloed_sorted_kept_nullifiers.array[i]);
            // A contract address will be assigned to the padding within constrained-land (see validate_sorted_siloed_padded_nullifiers).
            padded_siloed_sorted_kept_nullifiers.array[i].contract_address = AztecAddress::zero();
        }

        padded_siloed_sorted_kept_nullifiers
    }

    unconstrained fn get_padded_siloed_sorted_kept_private_logs<let PrivateLogSiloingAmount: u32>(
        self,
    ) -> ClaimedLengthArray<Scoped<Counted<PrivateLogData>>, MAX_PRIVATE_LOGS_PER_TX> {
        // Sort:
        let sorted_kept_private_logs = ClaimedLengthArray {
            array: sort_by_counter(self.squashed_output_array_hints.kept_private_logs.array),
            length: self.squashed_output_array_hints.kept_private_logs.length,
        };

        let num_kept_private_logs = sorted_kept_private_logs.length;
        let padded_private_logs = self.padded_side_effects.private_logs;

        // Calling this in the unconstrained context is not a problem. Since it doesn't matter if there are non-empty
        // items outside of the range [num_private_logs, PrivateLogSiloingAmount). The values will simply be ignored.
        // Having the check here is useful to catch any bugs where the padded values are not configured correctly by mistake.
        check_padded_items(
            padded_private_logs,
            num_kept_private_logs,
            PrivateLogSiloingAmount,
        );

        // The ordering of adjectives in this name is intentional (back to front).
        let mut padded_siloed_sorted_kept_private_logs = sorted_kept_private_logs;

        for i in 0..sorted_kept_private_logs.array.len() {
            // Pad:
            if (i >= num_kept_private_logs)
                // we only apply padding if the executor of this circuit provides padding as input:
                & (padded_private_logs[i].length != 0) {
                padded_siloed_sorted_kept_private_logs.push(PrivateLogData {
                    log: padded_private_logs[i],
                    note_hash_counter: 0, // Recall: this is only used to hint which note (if any) this log corresponds to.
                }
                    .count(MAX_U32_VALUE) // A dummy, revertible counter
                    // We "silo" the padding with this dummy address. This ensures an attacker cannot
                    // abuse this padding feature to impersonate logs from meaningful contract addresses.
                    // (E.g. we don't want an attacker to be able to send someone an encrypted event
                    // that looks to have come from a legitimate contract_address!!!)
                    .scope(SIDE_EFFECT_MASKING_ADDRESS));
            }

            // Silo:
            padded_siloed_sorted_kept_private_logs.array[i].inner.inner.log =
                silo_private_log(padded_siloed_sorted_kept_private_logs.array[i]);
            // A contract address will be assigned to the padding within constrained-land (see validate_sorted_siloed_padded_private_logs).
            padded_siloed_sorted_kept_private_logs.array[i].contract_address = AztecAddress::zero();
        }

        padded_siloed_sorted_kept_private_logs
    }
}
