mod previous_kernel_validator_hints;

use dep::types::{
    abis::{
        log_hash::LogHash,
        note_hash::ScopedNoteHash,
        nullifier::ScopedNullifier,
        private_kernel_data::PrivateKernelData,
        private_log::PrivateLogData,
        public_call_request::PublicCallRequest,
        side_effect::{Counted, Ordered, OrderedValue, scoped::Scoped},
    },
    address::AztecAddress,
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    proof::traits::Verifiable,
    traits::Empty,
    utils::arrays::DenseTrimmedArray,
};

use previous_kernel_validator_hints::{
    generate_previous_kernel_validator_hints, PreviousKernelValidatorHints,
};

#[derive(Eq)]
pub struct PreviousKernelDenseTrimmedArrays {
    pub note_hashes: Option<DenseTrimmedArray<ScopedNoteHash, MAX_NOTE_HASHES_PER_TX>>,
    pub nullifiers: Option<DenseTrimmedArray<ScopedNullifier, MAX_NULLIFIERS_PER_TX>>,
    pub l2_to_l1_msgs: Option<DenseTrimmedArray<Scoped<Counted<L2ToL1Message>>, MAX_L2_TO_L1_MSGS_PER_TX>>,

    pub private_logs: Option<DenseTrimmedArray<Scoped<PrivateLogData>, MAX_PRIVATE_LOGS_PER_TX>>,
    pub contract_class_logs_hashes: Option<DenseTrimmedArray<Scoped<Counted<LogHash>>, MAX_CONTRACT_CLASS_LOGS_PER_TX>>,

    pub public_call_requests: Option<DenseTrimmedArray<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_TX>>,
}

impl Empty for PreviousKernelDenseTrimmedArrays {
    fn empty() -> Self {
        Self {
            note_hashes: Option::none(),
            nullifiers: Option::none(),
            l2_to_l1_msgs: Option::none(),
            private_logs: Option::none(),
            contract_class_logs_hashes: Option::none(),
            public_call_requests: Option::none(),
        }
    }
}

pub struct PreviousKernelValidator {
    pub previous_kernel: PrivateKernelData,
    pub hints: PreviousKernelValidatorHints,
    pub previous_kernel_dense_trimmed_arrays: PreviousKernelDenseTrimmedArrays,
}

impl PreviousKernelValidator {
    pub fn new(previous_kernel: PrivateKernelData) -> Self {
        // Note: the only hint at the moment is the index of each transient note hash:
        // `transient_note_hash_index_for_each_nullifier`.
        //
        // Safety: the below hints are constrained by the following methods. See private_kernel_inner for use.
        let hints =
            unsafe { generate_previous_kernel_validator_hints(previous_kernel.public_inputs) };

        // Eurgh, I only really want this for the Tail circuit; not the other kernel circuits.
        // TODO: check whether this empty instantiation is costing unnecessary gates in the init & inner.
        let previous_kernel_dense_trimmed_arrays = PreviousKernelDenseTrimmedArrays::empty();

        PreviousKernelValidator { previous_kernel, hints, previous_kernel_dense_trimmed_arrays }
    }

    pub fn validate_proof<let N: u32>(self: Self, allowed_indices: [u32; N]) {
        if !dep::std::runtime::is_unconstrained() {
            self.previous_kernel.verify();
            self.previous_kernel.validate_in_vk_tree(allowed_indices);
        }
    }

    pub fn validate_for_private_tail(&mut self) {
        assert(
            self.previous_kernel.public_inputs.is_private_only,
            "Must be private only to be processed in tail",
        );
        self.validate_common();
        self.validate_empty_data();
        self.validate_first_nullifier(false);
    }

    pub fn validate_for_private_tail_to_public(&mut self) {
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

    fn validate_common(&mut self) {
        self.validate_fee_payer();
        self.validate_empty_private_call_stack();
        self.verify_empty_validation_requests();
        self.validate_dense_trimmed_arrays();
        self.verify_siloed_values();
        self.verify_no_transient_data();
    }

    fn validate_dense_trimmed_arrays(&mut self) {
        self.previous_kernel_dense_trimmed_arrays.note_hashes = Option::some(self
            .previous_kernel
            .public_inputs
            .end
            .note_hashes
            .assert_dense_trimmed());

        self.previous_kernel_dense_trimmed_arrays.nullifiers = Option::some(self
            .previous_kernel
            .public_inputs
            .end
            .nullifiers
            .assert_dense_trimmed());

        self.previous_kernel_dense_trimmed_arrays.l2_to_l1_msgs = Option::some(self
            .previous_kernel
            .public_inputs
            .end
            .l2_to_l1_msgs
            .assert_dense_trimmed());

        self.previous_kernel_dense_trimmed_arrays.private_logs = Option::some(self
            .previous_kernel
            .public_inputs
            .end
            .private_logs
            .assert_dense_trimmed());

        self.previous_kernel_dense_trimmed_arrays.contract_class_logs_hashes = Option::some(self
            .previous_kernel
            .public_inputs
            .end
            .contract_class_logs_hashes
            .assert_dense_trimmed());

        // Private call stack is separately validated to be empty.
        // Public call stack is separately validated to be:
        // - Empty if private tail.
        // - DenseTrimmed if tail to public.
    }

    fn validate_dense_trimmed_public_calls(&mut self) {
        self.previous_kernel_dense_trimmed_arrays.public_call_requests = Option::some(self
            .previous_kernel
            .public_inputs
            .end
            .public_call_requests
            .assert_dense_trimmed());
    }

    fn validate_fee_payer(self) {
        self.previous_kernel.public_inputs.fee_payer.assert_not_empty(); // "Fee payer can't be empty");
    }

    fn validate_empty_private_call_stack(self) {
        let _ = self.previous_kernel.public_inputs.end.private_call_stack.assert_empty(
            "Private call stack must be empty when executing the tail circuit",
        );
    }

    fn validate_empty_data(&mut self) {
        self.previous_kernel_dense_trimmed_arrays.public_call_requests = Option::some(self
            .previous_kernel
            .public_inputs
            .end
            .public_call_requests
            .assert_empty("Public call stack must be empty when executing the tail circuit"));

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
            self.previous_kernel.public_inputs.public_teardown_call_request.assert_not_empty(); // "Must have public calls when exporting public kernel data from the tail circuit");
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

    fn verify_empty_validation_requests(self) {
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
    fn verify_siloed_values(self) {
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
    fn verify_no_transient_data(self) {
        let nullifiers = self.previous_kernel.public_inputs.end.nullifiers;
        let note_hashes = self.previous_kernel.public_inputs.end.note_hashes;
        let transient_note_hash_index_for_each_nullifier =
            self.hints.transient_note_hash_index_for_each_nullifier;
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
