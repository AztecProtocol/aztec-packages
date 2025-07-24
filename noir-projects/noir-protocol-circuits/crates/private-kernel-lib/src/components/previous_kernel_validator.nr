mod previous_kernel_validator_hints;

use dep::types::{
    abis::{private_kernel_data::PrivateKernelData, side_effect::{Ordered, OrderedValue}},
    address::AztecAddress,
    proof::traits::Verifiable,
    traits::Empty,
};

use previous_kernel_validator_hints::generate_previous_kernel_validator_hints;

pub struct PreviousKernelValidator {
    pub previous_kernel: PrivateKernelData,
}

// TODO: consider renaming to be `Tail`-specific, because all the methods except `verify_proof` are tail-specific, iiuc.
impl PreviousKernelValidator {
    pub fn new(previous_kernel: PrivateKernelData) -> Self {
        PreviousKernelValidator { previous_kernel }
    }

    pub fn verify_proof<let N: u32>(self: Self, allowed_indices: [u32; N]) {
        if !dep::std::runtime::is_unconstrained() {
            self.previous_kernel.verify();
            self.previous_kernel.validate_vk_in_vk_tree(allowed_indices);
        }
    }

    pub fn validate_for_private_tail(self) {
        assert(
            self.previous_kernel.public_inputs.is_private_only,
            "Must be private only to be processed in tail",
        );
        self.validate_common();
        self.validate_empty_data();
        self.validate_first_nullifier(false);
    }

    pub fn validate_for_private_tail_to_public(self) {
        assert(
            !self.previous_kernel.public_inputs.is_private_only,
            "Must not be private only to be processed in tail to public",
        );
        self.validate_common();
        self.validate_dense_trimmed_public_calls();
        self.validate_non_empty_data();
        self.validate_first_nullifier(true);
    }

    fn validate_first_nullifier(self, tx_can_revert: bool) {
        let first_nullifier = self.previous_kernel.public_inputs.end.nullifiers.array[0];
        assert_eq(
            first_nullifier.value(),
            self.previous_kernel.public_inputs.claimed_first_nullifier,
            "First nullifier claim was not satisfied",
        );
        if tx_can_revert {
            assert(
                first_nullifier.nullifier.counter()
                    < self.previous_kernel.public_inputs.min_revertible_side_effect_counter,
                "First nullifier must be non revertible",
            );
        }
    }

    fn validate_common(self) {
        self.validate_fee_payer();
        self.validate_empty_private_call_stack();
        self.validate_empty_validation_requests();
        self.validate_dense_trimmed_arrays();
        self.validate_siloed_values();
        self.validate_no_transient_data();
    }

    fn validate_dense_trimmed_arrays(self) {
        self.previous_kernel.public_inputs.end.note_hashes.assert_dense_trimmed();

        self.previous_kernel.public_inputs.end.nullifiers.assert_dense_trimmed();

        self.previous_kernel.public_inputs.end.l2_to_l1_msgs.assert_dense_trimmed();

        self.previous_kernel.public_inputs.end.private_logs.assert_dense_trimmed();

        self.previous_kernel.public_inputs.end.contract_class_logs_hashes.assert_dense_trimmed();

        // Private call stack is separately validated to be empty.
        // Public call stack is separately validated to be:
        // - Empty if private tail.
        // - DenseTrimmed if tail to public.
    }

    fn validate_dense_trimmed_public_calls(self) {
        self.previous_kernel.public_inputs.end.public_call_requests.assert_dense_trimmed();
    }

    fn validate_fee_payer(self) {
        // TODO: use assert_not_empty after Noir #9002.

        assert(
            !self.previous_kernel.public_inputs.fee_payer.is_empty(),
            "Fee payer can't be empty",
        );
        // self.previous_kernel.public_inputs.fee_payer.assert_not_empty("Fee payer can't be empty");
    }

    fn validate_empty_private_call_stack(self) {
        self.previous_kernel.public_inputs.end.private_call_stack.assert_empty(
            "Private call stack must be empty when executing the tail circuit",
        );
    }

    fn validate_empty_data(self) {
        self.previous_kernel.public_inputs.end.public_call_requests.assert_empty(
            "Public call stack must be empty when executing the tail circuit",
        );

        self.previous_kernel.public_inputs.public_teardown_call_request.assert_empty(
            "Public teardown call request must be empty when executing the tail circuit",
        );

        if self.previous_kernel.public_inputs.validation_requests.split_counter.is_some() {
            // Even when min_revertible_side_effect_counter could be non-zero in a pure private tx.
            // The split counter must be 0 to ensure that all the transient data are squashed.
            assert_eq(
                self
                    .previous_kernel
                    .public_inputs
                    .validation_requests
                    .split_counter
                    .unwrap_unchecked(),
                0,
                "split_counter must be 0 for pure private tx",
            );
        }
    }

    fn validate_non_empty_data(self) {
        if self.previous_kernel.public_inputs.end.public_call_requests.length == 0 {
            assert(
                !self.previous_kernel.public_inputs.public_teardown_call_request.is_empty(),
                "Must have public calls when exporting public kernel data from the tail circuit",
            );
            // self.previous_kernel.public_inputs.public_teardown_call_request.assert_not_empty("Must have public calls when exporting public kernel data from the tail circuit");
        }

        assert(
            self.previous_kernel.public_inputs.min_revertible_side_effect_counter != 0,
            "min_revertible_side_effect_counter must not be 0",
        );

        if self.previous_kernel.public_inputs.validation_requests.split_counter.is_some() {
            assert_eq(
                self
                    .previous_kernel
                    .public_inputs
                    .validation_requests
                    .split_counter
                    .unwrap_unchecked(),
                self.previous_kernel.public_inputs.min_revertible_side_effect_counter,
                "split_counter does not match min_revertible_side_effect_counter",
            );
        }
    }

    fn validate_empty_validation_requests(self) {
        let _ = self
            .previous_kernel
            .public_inputs
            .validation_requests
            .note_hash_read_requests
            .length
            .assert_empty("Non empty note hash read requests");

        let _ = self
            .previous_kernel
            .public_inputs
            .validation_requests
            .nullifier_read_requests
            .assert_empty("Non empty nullifier read requests");

        let _ = self
            .previous_kernel
            .public_inputs
            .validation_requests
            .scoped_key_validation_requests_and_generators
            .assert_empty("Non empty key validation requests");
    }

    // Ensure that the data has been properly siloed in the reset circuit.
    fn validate_siloed_values(self) {
        // note_hashes
        let num_note_hashes = self.previous_kernel.public_inputs.end.note_hashes.length;
        if num_note_hashes != 0 {
            let note_hash =
                self.previous_kernel.public_inputs.end.note_hashes.array[num_note_hashes - 1];
            assert_eq(
                note_hash.contract_address,
                AztecAddress::zero(),
                "note hashes have not been siloed in a reset",
            );
        }

        // nullifiers
        let num_nullifiers = self.previous_kernel.public_inputs.end.nullifiers.length;
        let nullifier = self.previous_kernel.public_inputs.end.nullifiers.array[num_nullifiers - 1]; // - 1 without checking because there's at least 1 nullifier.
        assert_eq(
            nullifier.contract_address,
            AztecAddress::zero(),
            "nullifiers have not been siloed in a reset",
        );

        // private_logs
        let num_private_logs = self.previous_kernel.public_inputs.end.private_logs.length;
        if num_private_logs != 0 {
            let private_log =
                self.previous_kernel.public_inputs.end.private_logs.array[num_private_logs - 1];
            assert_eq(
                private_log.contract_address,
                AztecAddress::zero(),
                "private logs have not been siloed in a reset",
            );
        }
    }

    // This is mainly for ensuring that for any nullifier that links to a note hash,
    // it is created _after_ the note hash.
    // This is enforced for transient data when they are squashed in the reset circuit.
    // But if a pair is not transient, their counters will be checked here.
    // Why would we have a (nullifier, pending note) pair that is non-transient?
    // When a pending note hash is non-revertible and its nullifier is revertible, we can't
    // squash them, but we still need to perform this check on their counters.
    // A nice side effect of this check is that it also makes sure all the transient data is squashed:
    // In aztec-nr, if a contract is emitting a nullifier for a non-revertible note
    // hash, or if it doesn't want to squash the note hash at all (to keep a full record
    // of what had happened, for example), it could set the nullifier.note_hash to be
    // the _siloed_ note hash (or not set it at all).
    // When we run this function (in the tail), because the non-squashed note hashes
    // are already siloed in the reset circuit, the nullifiers that map to non-transient
    // note hashes will match up with those _siloed_ note hashes. But for nullifiers
    // that should already have been squashed against a transient (not siloed) note
    // hash, they won't be able to find a match.
    fn validate_no_transient_data(self) {
        // Note: the only hint at the moment is the index of each transient note hash:
        // `transient_note_hash_index_for_each_nullifier`.
        // Note: we generate the hints here, instead of in the constructor (`new()`),
        // because the hints are only needed in the Tail circuit, and returning
        // an output from an unconstrained function incurs range constraints that we
        // don't want non-Tail circuits to incur when calling `new()`.
        // Safety: the below hints are constrained by the following methods. See private_kernel_inner for use.
        let hints =
            unsafe { generate_previous_kernel_validator_hints(self.previous_kernel.public_inputs) };

        let nullifiers = self.previous_kernel.public_inputs.end.nullifiers;
        let note_hashes = self.previous_kernel.public_inputs.end.note_hashes;
        let transient_note_hash_index_for_each_nullifier =
            hints.transient_note_hash_index_for_each_nullifier;
        for i in 0..nullifiers.array.len() {
            let nullifier = nullifiers.array[i];
            let nullified_note_hash = nullifier.nullifier.note_hash;
            if nullified_note_hash != 0 {
                let note_hash = note_hashes.array[transient_note_hash_index_for_each_nullifier[i]];
                assert_eq(
                    note_hash.value(),
                    nullified_note_hash,
                    "Hinted siloed note hash does not match nullified note hash",
                );
                assert(
                    note_hash.counter() < nullifier.counter(),
                    "Cannot link a note hash emitted after a nullifier",
                );
                // No need to verify logs linked to a note hash are squashed.
                // When a note hash is squashed, all associated logs are guaranteed to be removed.
                // See reset-kernel-lib/src/reset/transient_data.nr for details.
            }
        }
    }
}
