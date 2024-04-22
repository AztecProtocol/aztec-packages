use dep::types::{
    abis::{
    kernel_circuit_public_inputs::{PrivateKernelCircuitPublicInputs, PrivateKernelCircuitPublicInputsBuilder},
    private_circuit_public_inputs::PrivateCircuitPublicInputs
},
    address::AztecAddress, constants::MAX_NEW_NOTE_HASHES_PER_CALL, hash::silo_note_hash,
    utils::arrays::array_to_bounded_vec
};

fn initialize_end_values(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    public_inputs: &mut PrivateKernelCircuitPublicInputsBuilder
) {
    public_inputs.constants = previous_kernel_public_inputs.constants;
    public_inputs.min_revertible_side_effect_counter = previous_kernel_public_inputs.min_revertible_side_effect_counter;

    let start = previous_kernel_public_inputs.validation_requests;
    public_inputs.validation_requests.max_block_number = start.for_rollup.max_block_number;
    public_inputs.validation_requests.note_hash_read_requests = array_to_bounded_vec(start.note_hash_read_requests);
    public_inputs.validation_requests.nullifier_read_requests = array_to_bounded_vec(start.nullifier_read_requests);
    public_inputs.validation_requests.nullifier_key_validation_requests = array_to_bounded_vec(start.nullifier_key_validation_requests);

    // Ensure the arrays are the same as previously, before we start pushing more data onto them in other
    // functions within this circuit:
    let start = previous_kernel_public_inputs.end;

    public_inputs.end.new_note_hashes = array_to_bounded_vec(start.new_note_hashes);
    public_inputs.end.new_nullifiers = array_to_bounded_vec(start.new_nullifiers);

    public_inputs.end.private_call_stack = array_to_bounded_vec(start.private_call_stack);
    public_inputs.end.public_call_stack = array_to_bounded_vec(start.public_call_stack);
    public_inputs.end.new_l2_to_l1_msgs = array_to_bounded_vec(start.new_l2_to_l1_msgs);

    public_inputs.end.encrypted_logs_hashes = array_to_bounded_vec(start.encrypted_logs_hashes);
    public_inputs.end.unencrypted_logs_hashes = array_to_bounded_vec(start.unencrypted_logs_hashes);

    public_inputs.end.encrypted_log_preimages_length = start.encrypted_log_preimages_length;
    public_inputs.end.unencrypted_log_preimages_length = start.unencrypted_log_preimages_length;
}

struct PrivateKernelCircuitPublicInputsComposer {
    public_inputs: PrivateKernelCircuitPublicInputsBuilder,
}

impl PrivateKernelCircuitPublicInputsComposer {
    pub fn new() -> Self {
        let public_inputs = PrivateKernelCircuitPublicInputsBuilder::empty();

        PrivateKernelCircuitPublicInputsComposer { public_inputs }
    }

    pub fn initialize_from_previous_kernel(previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs) -> Self {
        let mut public_inputs = PrivateKernelCircuitPublicInputsBuilder::empty();
        initialize_end_values(previous_kernel_public_inputs, &mut public_inputs);

        PrivateKernelCircuitPublicInputsComposer { public_inputs }
    }

    pub fn compose(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
        note_hash_nullifier_counters: [u32; MAX_NEW_NOTE_HASHES_PER_CALL]
    ) -> Self {
        let storage_contract_address = private_call_public_inputs.call_context.storage_contract_address;

        self.propagate_note_hashes(
            private_call_public_inputs,
            storage_contract_address,
            note_hash_nullifier_counters
        );

        *self
    }

    pub fn finish(self) -> PrivateKernelCircuitPublicInputs {
        self.public_inputs.finish()
    }

    fn propagate_note_hashes(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
        storage_contract_address: AztecAddress,
        note_hash_nullifier_counters: [u32; MAX_NEW_NOTE_HASHES_PER_CALL]
    ) {
        for i in 0..MAX_NEW_NOTE_HASHES_PER_CALL {
            let mut note_hash = private_call_public_inputs.new_note_hashes[i];
            if note_hash.value != 0 {
                let nullifier_counter = note_hash_nullifier_counters[i];
                assert(
                    (nullifier_counter == 0) | (nullifier_counter > note_hash.counter), "invalid nullifier counter"
                );

                // TODO: Silo values in the tail circuit.
                note_hash.value = silo_note_hash(storage_contract_address, note_hash.value);
                self.public_inputs.end.new_note_hashes.push(note_hash.to_context(nullifier_counter));
            }
        }
    }
}
