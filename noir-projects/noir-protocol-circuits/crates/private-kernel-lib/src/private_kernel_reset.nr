use crate::{
    abis::PaddedSideEffects,
    components::{
        previous_kernel_validator::PreviousKernelValidator,
        reset_output_composer::{ResetOutputComposer, ResetOutputHints},
        reset_output_validator::ResetOutputValidator,
    },
};
use dep::reset_kernel_lib::{
    KeyValidationHint, NoteHashReadRequestHints, NullifierReadRequestHints,
    PrivateValidationRequestProcessor, TransientDataIndexHint,
};
use dep::types::{
    abis::private_kernel_data::{PrivateKernelData, PrivateKernelDataWithoutPublicInputs},
    constants::{PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX},
    PrivateKernelCircuitPublicInputs,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX];

pub struct PrivateKernelResetHints<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_HINTS_LEN: u32, let TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32> {
    note_hash_read_request_hints: NoteHashReadRequestHints<NH_RR_PENDING, NH_RR_SETTLED>,
    nullifier_read_request_hints: NullifierReadRequestHints<NLL_RR_PENDING, NLL_RR_SETTLED>,
    key_validation_hints: [KeyValidationHint; KEY_VALIDATION_HINTS_LEN],
    transient_data_index_hints: [TransientDataIndexHint; TRANSIENT_DATA_SQUASHING_HINTS_LEN],
    validation_requests_split_counter: u32,
}

pub struct PrivateKernelResetDimensions {
    pub NOTE_HASH_PENDING_READ_AMOUNT: u32, // num pending note hash read requests to process
    pub NOTE_HASH_SETTLED_READ_AMOUNT: u32, // num settled note hash read requests to process (merkle membership)
    pub NULLIFIER_PENDING_READ_AMOUNT: u32, // num pending nullifier read requests to process
    pub NULLIFIER_SETTLED_READ_AMOUNT: u32, // num settled note hash read requests to process (merkle membership)
    pub KEY_VALIDATION_AMOUNT: u32, // num key validation requests to process
    pub TRANSIENT_DATA_SQUASHING_AMOUNT: u32, // num (note, nullifier, note_log) tuples to squash.
    // (Recall: we can squash a note that gets nullified in a later execution frame).
    pub NOTE_HASH_SILOING_AMOUNT: u32, // num new note hashes to silo
    pub NULLIFIER_SILOING_AMOUNT: u32, // num new nullifiers to silo
    pub PRIVATE_LOG_SILOING_AMOUNT: u32, // num private logs to silo
}

pub struct PrivateKernelResetCircuitPrivateInputs<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_HINTS_LEN: u32, let TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32> {
    previous_kernel: PrivateKernelData,
    padded_side_effects: PaddedSideEffects,
    hints: PrivateKernelResetHints<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN>,
    dimensions: PrivateKernelResetDimensions,
}

impl<let NH_RR_PENDING: u32, let NH_RR_SETTLED: u32, let NLL_RR_PENDING: u32, let NLL_RR_SETTLED: u32, let KEY_VALIDATION_HINTS_LEN: u32, let TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32> PrivateKernelResetCircuitPrivateInputs<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN> {
    pub fn new(
        previous_kernel: PrivateKernelDataWithoutPublicInputs,
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
        padded_side_effects: PaddedSideEffects,
        hints: PrivateKernelResetHints<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN, TRANSIENT_DATA_SQUASHING_HINTS_LEN>,
        dimensions: PrivateKernelResetDimensions,
    ) -> Self {
        Self {
            previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
            padded_side_effects,
            hints,
            dimensions,
        }
    }

    unconstrained fn generate_output(
        self,
        validation_request_processor: PrivateValidationRequestProcessor<NH_RR_PENDING, NH_RR_SETTLED, NLL_RR_PENDING, NLL_RR_SETTLED, KEY_VALIDATION_HINTS_LEN>,
    ) -> (PrivateKernelCircuitPublicInputs, ResetOutputHints) {
        // Many hints are generated within this `new` call.
        let composer = ResetOutputComposer::new(
            self.previous_kernel.public_inputs,
            validation_request_processor,
            self.padded_side_effects,
            self.hints.transient_data_index_hints,
            self.dimensions.NOTE_HASH_SILOING_AMOUNT,
            self.dimensions.NULLIFIER_SILOING_AMOUNT,
            self.dimensions.PRIVATE_LOG_SILOING_AMOUNT,
        );
        (composer.finish(), composer.hints)
    }

    pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
        let previous_public_inputs = self.previous_kernel.public_inputs;
        let validation_request_processor = PrivateValidationRequestProcessor {
            validation_requests: previous_public_inputs.validation_requests,
            note_hash_read_request_hints: self.hints.note_hash_read_request_hints,
            pending_note_hashes: previous_public_inputs.end.note_hashes,
            pending_note_hash_read_amount: self.dimensions.NOTE_HASH_PENDING_READ_AMOUNT,
            note_hash_tree_root: previous_public_inputs
                .constants
                .historical_header
                .state
                .partial
                .note_hash_tree
                .root,
            settled_note_hash_read_amount: self.dimensions.NOTE_HASH_SETTLED_READ_AMOUNT,
            nullifier_read_request_hints: self.hints.nullifier_read_request_hints,
            pending_nullifiers: previous_public_inputs.end.nullifiers,
            pending_nullifier_read_amount: self.dimensions.NULLIFIER_PENDING_READ_AMOUNT,
            nullifier_tree_root: previous_public_inputs
                .constants
                .historical_header
                .state
                .partial
                .nullifier_tree
                .root,
            settled_nullifier_read_amount: self.dimensions.NULLIFIER_SETTLED_READ_AMOUNT,
            key_validation_hints: self.hints.key_validation_hints,
            key_validation_amount: self.dimensions.KEY_VALIDATION_AMOUNT,
            validation_requests_split_counter: self.hints.validation_requests_split_counter,
        };

        // Validate inputs.
        let previous_kernel_validator = PreviousKernelValidator::new(self.previous_kernel);

        previous_kernel_validator.verify_proof(ALLOWED_PREVIOUS_CIRCUITS);

        // Generate output.
        // Safety: The output is validated below by ResetOutputValidator.
        let (output, output_hints) = unsafe { self.generate_output(validation_request_processor) };

        // Validate output.
        if dep::types::validate::should_validate_output() {
            ResetOutputValidator::new(
                output,
                previous_public_inputs,
                validation_request_processor,
                self.hints.transient_data_index_hints,
                self.dimensions.TRANSIENT_DATA_SQUASHING_AMOUNT,
                self.dimensions.NOTE_HASH_SILOING_AMOUNT,
                self.dimensions.NULLIFIER_SILOING_AMOUNT,
                self.dimensions.PRIVATE_LOG_SILOING_AMOUNT,
                self.padded_side_effects,
                output_hints,
            )
                .validate();
        }

        output
    }
}

mod tests {
    use crate::{
        abis::PaddedSideEffects,
        private_kernel_reset::{
            ALLOWED_PREVIOUS_CIRCUITS, PrivateKernelResetCircuitPrivateInputs,
            PrivateKernelResetDimensions, PrivateKernelResetHints,
        },
    };
    use dep::reset_kernel_lib::{
        reset::key_validation_request::KeyValidationHint,
        tests::{
            note_hash_read_request_hints_builder::NoteHashReadRequestHintsBuilder,
            nullifier_read_request_hints_builder::NullifierReadRequestHintsBuilder,
        },
        TransientDataIndexHint,
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
        constants::{
            MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_U32_VALUE,
            PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_TAIL_INDEX, SIDE_EFFECT_MASKING_ADDRESS,
        },
        hash::{
            compute_app_secret_key, compute_siloed_nullifier, compute_unique_siloed_note_hash,
            silo_note_hash, silo_nullifier, silo_private_log,
        },
        tests::{
            fixture_builder::FixtureBuilder,
            utils::{assert_array_eq, make_fixture, pad_end, swap_items},
        },
        traits::{Empty, FromField},
        utils::arrays::find_index_hint,
    };
    use std::embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul as derive_public_key};

    global NOTE_HASH_PENDING_READ_HINTS_LEN: u32 = 6;
    global NOTE_HASH_SETTLED_READ_HINTS_LEN: u32 = 3;
    global NULLIFIER_PENDING_READ_HINTS_LEN: u32 = 5;
    global NULLIFIER_SETTLED_READ_HINTS_LEN: u32 = 2;
    global TRANSIENT_DATA_SQUASHING_HINTS_LEN: u32 = 6;
    global KEY_VALIDATION_HINTS_LEN: u32 = 4;
    global NOTE_HASH_SILOING_AMOUNT: u32 = 6;
    global NULLIFIER_SILOING_AMOUNT: u32 = 6;
    global PRIVATE_LOG_SILOING_AMOUNT: u32 = 5;

    struct PrivateKernelResetInputsBuilder {
        previous_kernel: FixtureBuilder,
        padded_side_effects: PaddedSideEffects,
        transient_data_index_hints: [TransientDataIndexHint; TRANSIENT_DATA_SQUASHING_HINTS_LEN],
        note_hash_read_request_hints_builder: NoteHashReadRequestHintsBuilder<NOTE_HASH_PENDING_READ_HINTS_LEN, NOTE_HASH_SETTLED_READ_HINTS_LEN>,
        nullifier_read_request_hints_builder: NullifierReadRequestHintsBuilder<NULLIFIER_PENDING_READ_HINTS_LEN, NULLIFIER_SETTLED_READ_HINTS_LEN>,
        key_validation_hints: BoundedVec<KeyValidationHint, KEY_VALIDATION_HINTS_LEN>,
        validation_requests_split_counter: u32,
        dimensions: PrivateKernelResetDimensions,
    }

    impl PrivateKernelResetInputsBuilder {
        pub fn new() -> Self {
            let mut previous_kernel = FixtureBuilder::new().in_vk_tree(PRIVATE_KERNEL_INNER_INDEX);

            let dimensions = PrivateKernelResetDimensions {
                NOTE_HASH_PENDING_READ_AMOUNT: NOTE_HASH_PENDING_READ_HINTS_LEN,
                NOTE_HASH_SETTLED_READ_AMOUNT: NOTE_HASH_SETTLED_READ_HINTS_LEN,
                NULLIFIER_PENDING_READ_AMOUNT: NULLIFIER_PENDING_READ_HINTS_LEN,
                NULLIFIER_SETTLED_READ_AMOUNT: NULLIFIER_SETTLED_READ_HINTS_LEN,
                KEY_VALIDATION_AMOUNT: KEY_VALIDATION_HINTS_LEN,
                TRANSIENT_DATA_SQUASHING_AMOUNT: 0,
                NOTE_HASH_SILOING_AMOUNT: 0,
                NULLIFIER_SILOING_AMOUNT: 0,
                PRIVATE_LOG_SILOING_AMOUNT: 0,
            };

            Self {
                previous_kernel,
                transient_data_index_hints: [
                    TransientDataIndexHint::nada(MAX_NULLIFIERS_PER_TX, MAX_NOTE_HASHES_PER_TX);
                         TRANSIENT_DATA_SQUASHING_HINTS_LEN
                    ],
                note_hash_read_request_hints_builder: NoteHashReadRequestHintsBuilder::new(),
                nullifier_read_request_hints_builder: NullifierReadRequestHintsBuilder::new(),
                key_validation_hints: BoundedVec::new(),
                validation_requests_split_counter: 0,
                dimensions,
                padded_side_effects: PaddedSideEffects::empty(),
            }
        }

        pub fn with_siloing(&mut self) -> Self {
            self.dimensions.NOTE_HASH_SILOING_AMOUNT = NOTE_HASH_SILOING_AMOUNT;
            self.dimensions.NULLIFIER_SILOING_AMOUNT = NULLIFIER_SILOING_AMOUNT;
            self.dimensions.PRIVATE_LOG_SILOING_AMOUNT = PRIVATE_LOG_SILOING_AMOUNT;
            *self
        }

        pub fn add_pending_note_hash_read_request(&mut self, note_hash_index: u32) {
            let read_request_index =
                self.previous_kernel.add_read_request_for_pending_note_hash(note_hash_index);
            self.note_hash_read_request_hints_builder.add_pending_read_hint(
                read_request_index,
                note_hash_index,
            );
        }

        pub fn add_pending_nullifier_read_request(&mut self, nullifier_index: u32) {
            let read_request_index =
                self.previous_kernel.add_read_request_for_pending_nullifier(nullifier_index);
            self.nullifier_read_request_hints_builder.add_pending_read_hint(
                read_request_index,
                nullifier_index,
            );
        }

        pub fn nullify_pending_note_hash(&mut self, nullifier_index: u32, note_hash_index: u32) {
            let note_hash = self.previous_kernel.note_hashes.get(note_hash_index).note_hash;
            let mut nullifier = self.previous_kernel.nullifiers.get(nullifier_index);
            nullifier.nullifier.note_hash = note_hash.value;
            self.previous_kernel.nullifiers.set(nullifier_index, nullifier);
            // Safety: this is only used in tests.
            let num_hints = unsafe {
                find_index_hint(
                    self.transient_data_index_hints,
                    |hint: TransientDataIndexHint| hint.nullifier_index == MAX_NULLIFIERS_PER_TX,
                )
            }
                .unwrap();
            self.transient_data_index_hints[num_hints] =
                TransientDataIndexHint { nullifier_index, note_hash_index };

            self.dimensions.TRANSIENT_DATA_SQUASHING_AMOUNT += 1;
        }

        pub fn add_key_validation_request(&mut self, sk: Field) {
            let sk_m = EmbeddedCurveScalar::from_field(sk);
            let pk_m = derive_public_key(sk_m);

            let sk_app_generator = 123321;
            let contract_address = self.previous_kernel.contract_address;
            let sk_app = compute_app_secret_key(sk_m, contract_address, sk_app_generator);

            self.previous_kernel.add_request_for_key_validation(pk_m, sk_app, sk_app_generator);
        }

        pub fn add_key_validation_request_and_hint(&mut self, sk: Field) {
            self.add_key_validation_request(sk);

            let sk_m = EmbeddedCurveScalar::from_field(sk);
            self.key_validation_hints.push(KeyValidationHint { sk_m })
        }

        pub fn compute_output_note_hashes<let N: u32>(
            self: Self,
            note_hashes: [ScopedNoteHash; N],
        ) -> [ScopedNoteHash; N] {
            let is_private_only = self.previous_kernel.is_private_only;
            let min_revertible_side_effect_counter =
                self.previous_kernel.min_revertible_side_effect_counter;

            let mut output = note_hashes;
            for i in 0..N {
                let note_hash = note_hashes[i];
                let siloed_note_hash = silo_note_hash(note_hash);
                let unique_note_hash = compute_unique_siloed_note_hash(
                    siloed_note_hash,
                    self.previous_kernel.claimed_first_nullifier,
                    i,
                );
                // We don't silo with nonce revertible note hashes, since we don't know their final position in the tx
                output[i].note_hash.value = if is_private_only
                    | (note_hash.counter() < min_revertible_side_effect_counter) {
                    unique_note_hash
                } else {
                    siloed_note_hash
                };
                output[i].contract_address = AztecAddress::zero();
            }
            output
        }

        pub fn compute_output_nullifiers<let N: u32>(
            _self: Self,
            nullifiers: [ScopedNullifier; N],
        ) -> [ScopedNullifier; N] {
            let mut output = nullifiers;
            for i in 1..N {
                output[i].nullifier.value = silo_nullifier(nullifiers[i]);
                output[i].contract_address = AztecAddress::zero();
            }
            output
        }

        pub fn compute_output_private_logs<let N: u32>(
            _self: Self,
            private_logs: [Scoped<PrivateLogData>; N],
        ) -> [Scoped<PrivateLogData>; N] {
            private_logs.map(|l: Scoped<PrivateLogData>| {
                PrivateLogData {
                    log: silo_private_log(l),
                    note_hash_counter: l.inner.note_hash_counter,
                    counter: l.inner.counter,
                }
                    .scope(AztecAddress::zero())
            })
        }

        pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
            let note_hash_read_request_hints = self.note_hash_read_request_hints_builder.to_hints();
            let nullifier_read_request_hints = self.nullifier_read_request_hints_builder.to_hints();
            let hints = PrivateKernelResetHints {
                note_hash_read_request_hints,
                nullifier_read_request_hints,
                key_validation_hints: self.key_validation_hints.storage(),
                transient_data_index_hints: self.transient_data_index_hints,
                validation_requests_split_counter: self.validation_requests_split_counter,
            };

            let kernel = PrivateKernelResetCircuitPrivateInputs {
                previous_kernel: self.previous_kernel.to_private_kernel_data(),
                padded_side_effects: self.padded_side_effects,
                hints,
                dimensions: self.dimensions,
            };
            kernel.execute()
        }

        pub fn failed(self) {
            let _ = self.execute();
        }

        pub fn succeeded(self) {
            let _ = self.execute();
        }
    }

    #[test]
    fn correct_private_kernel_reset_output_propagated_values() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        let constants = builder.previous_kernel.to_tx_constant_data();
        builder.previous_kernel.min_revertible_side_effect_counter = 246;
        let public_teardown_call_request = make_fixture(999);
        builder.previous_kernel.public_teardown_call_request = public_teardown_call_request;
        builder.previous_kernel.fee_payer = AztecAddress::from_field(62);
        builder.previous_kernel.include_by_timestamp = 13;
        builder.previous_kernel.is_private_only = true;
        builder.previous_kernel.claimed_first_nullifier = 7788;

        let public_inputs = builder.execute();

        assert_eq(public_inputs.constants, constants);
        assert_eq(public_inputs.min_revertible_side_effect_counter, 246);
        assert_eq(public_inputs.public_teardown_call_request, public_teardown_call_request);
        assert_eq(public_inputs.fee_payer, AztecAddress::from_field(62));
        assert_eq(public_inputs.include_by_timestamp, 13);
        assert_eq(public_inputs.is_private_only, true);
        assert_eq(public_inputs.claimed_first_nullifier, 7788);
    }

    #[test]
    fn two_pending_note_hash_read_request() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        builder.previous_kernel.append_note_hashes(3);
        builder.add_pending_note_hash_read_request(1);
        builder.add_pending_note_hash_read_request(0);

        builder.succeeded();
    }

    #[test(should_fail_with = "Value of the note hash does not match read request")]
    fn pending_note_hash_read_request_wrong_hint_fails() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        builder.previous_kernel.append_note_hashes(3);
        builder.add_pending_note_hash_read_request(1);
        let mut hint = builder.note_hash_read_request_hints_builder.pending_read_hints.pop();
        hint.pending_value_index = 2;
        builder.note_hash_read_request_hints_builder.pending_read_hints.push(hint);

        builder.failed();
    }

    #[test]
    fn one_pending_nullifier_read_request() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        builder.previous_kernel.append_nullifiers(3);
        builder.add_pending_nullifier_read_request(1);

        builder.succeeded();
    }

    #[test]
    fn two_pending_nullifier_read_requests() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        builder.previous_kernel.append_nullifiers(3);
        builder.add_pending_nullifier_read_request(1);
        builder.add_pending_nullifier_read_request(0);

        builder.succeeded();
    }

    #[test(should_fail_with = "Value of the nullifier does not match read request")]
    fn pending_nullifier_read_request_wrong_hint_fails() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        builder.previous_kernel.append_nullifiers(3);
        builder.add_pending_nullifier_read_request(1);
        let mut hint = builder.nullifier_read_request_hints_builder.pending_read_hints.pop();
        assert(hint.pending_value_index == 1);
        hint.pending_value_index = 0;
        builder.nullifier_read_request_hints_builder.pending_read_hints.push(hint);

        builder.failed();
    }

    #[test(should_fail_with = "Read request counter must be greater than the counter of the nullifier")]
    fn pending_nullifier_read_request_reads_before_value_fails() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        builder.previous_kernel.append_nullifiers(3);
        builder.add_pending_nullifier_read_request(1);
        let nullifier_being_read = builder.previous_kernel.nullifiers.get(2);
        let mut read_request = builder.previous_kernel.nullifier_read_requests.pop();
        read_request.read_request.counter = nullifier_being_read.counter() - 1;
        builder.previous_kernel.nullifier_read_requests.push(read_request);

        builder.failed();
    }

    #[test]
    fn propagates_unverified_requests() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        builder.previous_kernel.append_note_hashes(3);
        builder.previous_kernel.append_nullifiers(3);

        builder.add_pending_note_hash_read_request(0);
        builder.add_pending_nullifier_read_request(1);

        // Now add some read requests that will be propagated
        let remaining_note_hash_rr_index =
            builder.previous_kernel.add_read_request_for_pending_note_hash(1);
        let note_hash_rr =
            builder.previous_kernel.note_hash_read_requests.get(remaining_note_hash_rr_index);

        let remaining_nullifier_rr_index =
            builder.previous_kernel.add_read_request_for_pending_nullifier(1);
        let nullifier_rr =
            builder.previous_kernel.nullifier_read_requests.get(remaining_nullifier_rr_index);

        builder.add_key_validation_request(123);
        let key_validation =
            builder.previous_kernel.scoped_key_validation_requests_and_generators.get(0);
        // Don't verify the key validation request.
        builder.dimensions.KEY_VALIDATION_AMOUNT = 0;

        // Check that they have been propagated to the next kernel
        let result = builder.execute();

        assert_array_eq(
            result.validation_requests.note_hash_read_requests.array,
            [note_hash_rr],
        );
        assert_array_eq(
            result.validation_requests.nullifier_read_requests.array,
            [nullifier_rr],
        );
        assert_array_eq(
            result.validation_requests.scoped_key_validation_requests_and_generators.array,
            [key_validation],
        );
    }

    #[test]
    fn native_squash_one_of_one_transient_matches_works() {
        let mut builder = PrivateKernelResetInputsBuilder::new();
        builder.previous_kernel.append_note_hashes_with_logs(1);
        builder.previous_kernel.append_nullifiers(2);
        // The nullifier at index 0 is nullifying the hash at index 0;
        builder.nullify_pending_note_hash(0, 0);
        let nullifiers = builder.previous_kernel.nullifiers.storage();
        let public_inputs = builder.execute();

        assert(public_inputs.end.note_hashes.is_empty());

        // The nullifier at index 0 is chopped.
        assert_array_eq(public_inputs.end.nullifiers.array, [nullifiers[1]]);
        assert(public_inputs.end.private_logs.is_empty());
    }

    #[test]
    fn native_squash_one_of_two_transient_matches_works() {
        let mut builder = PrivateKernelResetInputsBuilder::new();
        builder.previous_kernel.append_note_hashes_with_logs(2);
        builder.previous_kernel.append_nullifiers(2);
        // The nullifier at index 1 is nullifying the hash at index 0;
        builder.nullify_pending_note_hash(0, 0);
        let note_hashes = builder.previous_kernel.note_hashes.storage();
        let nullifiers = builder.previous_kernel.nullifiers.storage();
        let private_logs = builder.previous_kernel.private_logs.storage();
        let public_inputs = builder.execute();

        // The 0th hash is chopped.
        assert_array_eq(public_inputs.end.note_hashes.array, [note_hashes[1]]);

        // The nullifier at index 0 is chopped.
        assert_array_eq(public_inputs.end.nullifiers.array, [nullifiers[1]]);

        // The 0th log is chopped.
        assert_array_eq(public_inputs.end.private_logs.array, [private_logs[1]]);
    }

    #[test]
    fn native_squash_two_of_two_transient_matches_works() {
        let mut builder = PrivateKernelResetInputsBuilder::new();
        builder.previous_kernel.append_note_hashes_with_logs(2);
        builder.previous_kernel.append_nullifiers(2);
        // The nullifier at index 0 is nullifying the hash at index 1;
        builder.nullify_pending_note_hash(0, 1);
        // The nullifier at index 1 is nullifying the hash at index 0;
        builder.nullify_pending_note_hash(1, 0);
        let public_inputs = builder.execute();

        assert(public_inputs.end.note_hashes.is_empty());

        // No nullifiers left after squashing.
        assert_array_eq(public_inputs.end.nullifiers.array, []);
        assert(public_inputs.end.private_logs.is_empty());
    }

    #[test]
    fn squash_unordered_transient_notes_works() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        builder.previous_kernel.append_note_hashes_with_logs(3);
        // Shuffle the note hashes so they will have to be re-ordered.
        let tmp = builder.previous_kernel.note_hashes.get(0);
        builder.previous_kernel.note_hashes.set(0, builder.previous_kernel.note_hashes.get(1));
        builder.previous_kernel.note_hashes.set(1, builder.previous_kernel.note_hashes.get(2));
        builder.previous_kernel.note_hashes.set(2, tmp);

        builder.previous_kernel.append_nullifiers(3);
        // Shuffle the nullifiers so they will have to be re-ordered.
        let tmp = builder.previous_kernel.nullifiers.get(0);
        builder.previous_kernel.nullifiers.set(0, builder.previous_kernel.nullifiers.get(2));
        builder.previous_kernel.nullifiers.set(2, builder.previous_kernel.nullifiers.get(1));
        builder.previous_kernel.nullifiers.set(1, tmp);

        // The nullifier at index 0 is nullifying the note hash at index 1;
        builder.nullify_pending_note_hash(0, 1);
        // The nullifier at index 1 is nullifying the note hash at index 2;
        builder.nullify_pending_note_hash(1, 2);
        // The nullifier at index 2 is nullifying the note hash at index 0;
        builder.nullify_pending_note_hash(2, 0);

        let public_inputs = builder.execute();

        assert(public_inputs.end.note_hashes.is_empty());

        // No nullifiers left after squashing.
        assert_array_eq(public_inputs.end.nullifiers.array, []);
        assert(public_inputs.end.private_logs.is_empty());
    }

    #[test(should_fail_with = "Value of the hinted transient note hash does not match")]
    fn wrong_transient_nullifier_index_for_note_hash_fails() {
        let mut builder = PrivateKernelResetInputsBuilder::new();
        builder.previous_kernel.append_note_hashes(1);
        builder.previous_kernel.append_nullifiers(2);
        // The nullifier at index 1 is nullifying the hash at index 0;
        builder.nullify_pending_note_hash(1, 0);
        // Change the hint to point to a different nullifier.
        builder.transient_data_index_hints[0].nullifier_index = 0;
        builder.failed();
    }

    #[test]
    fn reset_key_validation_request_succeeds() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        builder.add_key_validation_request_and_hint(13579);
        builder.add_key_validation_request_and_hint(2468);
        builder.add_key_validation_request_and_hint(54321);

        let public_inputs = builder.execute();
        assert(public_inputs
            .validation_requests
            .scoped_key_validation_requests_and_generators
            .is_empty());
    }

    #[test]
    fn reset_partial_key_validation_request_succeeds() {
        let mut builder = PrivateKernelResetInputsBuilder::new();

        for i in 0..KEY_VALIDATION_HINTS_LEN {
            builder.add_key_validation_request_and_hint(i as Field + 123);
        }
        // Create two more requests without hints.
        for i in 0..2 {
            builder.add_key_validation_request(i as Field + 456);
        }

        let num_requests = KEY_VALIDATION_HINTS_LEN + 2;
        let requests =
            builder.previous_kernel.scoped_key_validation_requests_and_generators.storage();

        let public_inputs = builder.execute();

        assert_array_eq(
            public_inputs.validation_requests.scoped_key_validation_requests_and_generators.array,
            [requests[num_requests - 2], requests[num_requests - 1]],
        );
    }

    #[test]
    fn propagate_fee_payer() {
        // Check that we carry forward if the fee payer is already set
        let mut builder = PrivateKernelResetInputsBuilder::new();
        let fee_payer = AztecAddress::from_field(123);
        builder.previous_kernel.fee_payer = fee_payer;
        let public_inputs = builder.execute();
        assert_eq(public_inputs.fee_payer, fee_payer);

        // Check that the fee payer remains empty if unset
        let mut builder = PrivateKernelResetInputsBuilder::new();
        let public_inputs = builder.execute();
        assert_eq(public_inputs.fee_payer, AztecAddress::empty());
    }

    #[test]
    fn squashing_and_siloing_and_ordering_succeeds() {
        let mut builder = PrivateKernelResetInputsBuilder::new().with_siloing();
        builder.previous_kernel.set_protocol_nullifier();

        builder.previous_kernel.append_note_hashes_with_logs(1);
        builder.previous_kernel.append_private_logs(1); // Log at index 1 is a non-note log.
        builder.previous_kernel.append_note_hashes_with_logs(2);
        builder.previous_kernel.append_private_logs(1); // Log at index 4 is a non-note log.
        builder.previous_kernel.append_note_hashes(1);
        builder.previous_kernel.append_nullifiers(3);
        // The nullifier at index 2 is nullifying a note hash that doesn't exist yet.
        let mut nullifier = builder.previous_kernel.nullifiers.get(2);
        nullifier.nullifier.note_hash = 9988;
        builder.previous_kernel.nullifiers.set(2, nullifier);
        // Get ordered items before shuffling.
        let note_hashes = builder.previous_kernel.note_hashes.storage();
        let nullifiers = builder.previous_kernel.nullifiers.storage();
        let private_logs = builder.previous_kernel.private_logs.storage();
        // Shuffle.
        swap_items(&mut builder.previous_kernel.note_hashes, 1, 0);
        swap_items(&mut builder.previous_kernel.note_hashes, 3, 2);
        swap_items(&mut builder.previous_kernel.nullifiers, 2, 3);
        swap_items(&mut builder.previous_kernel.private_logs, 1, 2);
        // The nullifier at index 1 is nullifying the note hash at index 2 (original index 2).
        builder.nullify_pending_note_hash(1, 3);

        let public_inputs = builder.execute();

        // The note hash at index 2 is chopped.
        let output_note_hashes =
            builder.compute_output_note_hashes([note_hashes[0], note_hashes[1], note_hashes[3]]);
        assert_array_eq(public_inputs.end.note_hashes.array, output_note_hashes);

        // The nullifier at index 1 is chopped.
        let output_nullifiers =
            builder.compute_output_nullifiers([nullifiers[0], nullifiers[2], nullifiers[3]]);
        assert_array_eq(public_inputs.end.nullifiers.array, output_nullifiers);

        // The note log at index 3 is chopped.
        let output_logs = builder.compute_output_private_logs([
            private_logs[0],
            private_logs[1],
            private_logs[2],
            private_logs[4],
        ]);
        assert_array_eq(public_inputs.end.private_logs.array, output_logs);
    }

    #[test]
    fn siloing_without_protocol_nullifier_succeeds() {
        let mut builder = PrivateKernelResetInputsBuilder::new().with_siloing();

        builder.previous_kernel.append_note_hashes(1);
        let note_hash = builder.previous_kernel.note_hashes.get(0);

        let public_inputs = builder.execute();

        // The note hash at index 2 is chopped.
        let output_note_hash = builder.compute_output_note_hashes([note_hash])[0];
        assert_array_eq(public_inputs.end.note_hashes.array, [output_note_hash]);
    }

    #[test(should_fail_with = "note hashes have been siloed in a previous reset")]
    fn siloing_note_hashes_again_fails() {
        let mut builder = PrivateKernelResetInputsBuilder::new().with_siloing();

        builder.previous_kernel.append_note_hashes(2);

        // The note hash at index 0 is siloed.
        let mut note_hash = builder.previous_kernel.note_hashes.get(0);
        note_hash.contract_address = AztecAddress::zero();
        builder.previous_kernel.note_hashes.set(0, note_hash);

        builder.failed();
    }

    // #[test]
    // fn siloing_nullifiers_again_succeeds() {
    //     let mut builder = PrivateKernelResetInputsBuilder::new().with_siloing();

    //     builder.previous_kernel.append_nullifiers(2);

    //     // The nullifier at index 0 is siloed.
    //     let mut nullifier = builder.previous_kernel.nullifiers.get(0);
    //     nullifier.contract_address = AztecAddress::zero();
    //     builder.previous_kernel.nullifiers.set(0, nullifier);

    //     let nullifiers = builder.previous_kernel.nullifiers.storage();

    //     let public_inputs = builder.execute();

    //     let output_nullifiers = public_inputs.end.nullifiers;
    //     // The 0th nullifier doesn't change.
    //     assert(OrderedValue::<Field>::value(output_nullifiers.array[0]) == nullifiers[0].value());
    //     // The 1st nullifier has been siloed
    //     assert(OrderedValue::<Field>::value(output_nullifiers.array[1]) != nullifiers[1].value());
    // }

    #[test]
    fn squashing_and_siloing_unordered_with_padded_items_succeeds() {
        let mut builder = PrivateKernelResetInputsBuilder::new().with_siloing();
        // Add a protocol nullifier.
        builder.previous_kernel.set_protocol_nullifier();

        builder.previous_kernel.append_note_hashes_with_logs(3);
        builder.previous_kernel.append_nullifiers(3);

        // Get ordered items before shuffling.
        let note_hashes = builder.previous_kernel.note_hashes.storage();
        let nullifiers = builder.previous_kernel.nullifiers.storage();
        let private_logs = builder.previous_kernel.private_logs.storage();

        // Shuffle.
        // note_hashes: [0, 1, 2] -> [1, 2, 0]
        swap_items(&mut builder.previous_kernel.note_hashes, 1, 0);
        swap_items(&mut builder.previous_kernel.note_hashes, 1, 2);
        // nullifiers: [P, 1, 2, 3] -> [P, 3, 2, 1]
        swap_items(&mut builder.previous_kernel.nullifiers, 1, 3);
        // private_logs: [0, 1, 2] -> [1, 0, 2]
        swap_items(&mut builder.previous_kernel.private_logs, 0, 1);

        // The nullifier at index 2 (original index 2) is nullifying the note hash at index 0 (original index 1)
        builder.nullify_pending_note_hash(2, 0);

        // Add padded items.
        let padded_note_hashes = [
            NoteHash { value: 345, counter: MAX_U32_VALUE },
            NoteHash { value: 123, counter: MAX_U32_VALUE },
        ]
            .map(|n| n.scope(SIDE_EFFECT_MASKING_ADDRESS));
        let padded_nullifiers = [Nullifier {
            value: compute_siloed_nullifier(SIDE_EFFECT_MASKING_ADDRESS, 500),
            counter: MAX_U32_VALUE,
            note_hash: 0,
        }
            .scope(SIDE_EFFECT_MASKING_ADDRESS)];
        let padded_private_logs = [PrivateLogData {
            log: PrivateLog { fields: pad_end([22, 33], 0), length: 2 },
            note_hash_counter: 0,
            counter: MAX_U32_VALUE,
        }
            .scope(SIDE_EFFECT_MASKING_ADDRESS)];

        builder.padded_side_effects.note_hashes[2] = padded_note_hashes[0].value();
        builder.padded_side_effects.note_hashes[3] = padded_note_hashes[1].value();
        builder.padded_side_effects.nullifiers[3] = padded_nullifiers[0].value();
        builder.padded_side_effects.private_logs[2] = padded_private_logs[0].inner.log;

        let public_inputs = builder.execute();

        // The note hash at index 2 is squashed.
        assert_array_eq(
            public_inputs.end.note_hashes.array,
            builder.compute_output_note_hashes([
                note_hashes[0],
                note_hashes[2],
                padded_note_hashes[0],
                padded_note_hashes[1],
            ]),
        );

        // The nullifier at index 1 is squashed.
        assert_array_eq(
            public_inputs.end.nullifiers.array,
            builder.compute_output_nullifiers([
                nullifiers[0],
                nullifiers[1],
                nullifiers[3],
                padded_nullifiers[0],
            ]),
        );

        // The log at index 2 is chopped.
        assert_array_eq(
            public_inputs.end.private_logs.array,
            builder.compute_output_private_logs([
                private_logs[0],
                private_logs[2],
                padded_private_logs[0],
            ]),
        );
    }

    #[test]
    fn valid_previous_kernel() {
        for i in 0..ALLOWED_PREVIOUS_CIRCUITS.len() {
            let mut builder = PrivateKernelResetInputsBuilder::new();
            builder.previous_kernel =
                builder.previous_kernel.in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS[i]);

            let _res = builder.execute();
        }
    }

    #[test(should_fail_with = "Invalid vk index")]
    fn invalid_previous_kernel() {
        let mut builder = PrivateKernelResetInputsBuilder::new();
        builder.previous_kernel = builder.previous_kernel.in_vk_tree(PRIVATE_KERNEL_TAIL_INDEX);
        let _res = builder.execute();
    }
}
