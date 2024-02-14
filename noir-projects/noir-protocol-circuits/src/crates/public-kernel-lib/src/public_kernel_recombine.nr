use crate::common;
use dep::types::abis::{
    kernel_circuit_public_inputs::{
    PrivateKernelTailCircuitPublicInputs, RollupKernelCircuitPublicInputs,
    RollupKernelCircuitPublicInputsBuilder, CombinedAccumulatedDataBuilder
},
    kernel_data::PublicKernelData, public_call_data::PublicCallData
};
use dep::types::utils::arrays::array_to_bounded_vec;
use dep::types::traits::is_empty;
use dep::types::constants::{
    MAX_NON_REVERTIBLE_COMMITMENTS_PER_TX, MAX_REVERTIBLE_COMMITMENTS_PER_TX,
    MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX, MAX_REVERTIBLE_NULLIFIERS_PER_TX
};
use dep::std::unsafe;

struct PublicKernelRecombineCircuitPrivateInputs {
    previous_kernel: PublicKernelData,
    public_call: PublicCallData,
}

impl PublicKernelRecombineCircuitPrivateInputs {
    fn validate_inputs(self) {
        let needs_setup = self.previous_kernel.public_inputs.needs_setup;
        assert(needs_setup == false, "Cannot run recombine circuit before setup circuit");
        let needs_app_logic = self.previous_kernel.public_inputs.needs_app_logic;
        assert(needs_app_logic == false, "Cannot run recombine circuit before app logic circuit");
        let needs_teardown = self.previous_kernel.public_inputs.needs_teardown;
        assert(needs_teardown == false, "Cannot run recombine circuit before teardown circuit");

        let call_stack = self.previous_kernel.public_inputs.end.private_call_stack;
        for i in 0..call_stack.len() {
            let call = call_stack[i];
            assert(
                call.is_empty(), "App private call stack must be empty when executing in the public recombine kernel"
            );
        }
        let call_stack = self.previous_kernel.public_inputs.end.public_call_stack;
        for i in 0..call_stack.len() {
            let call = call_stack[i];
            assert(
                call.is_empty(), "App public call stack must be empty when executing in the public recombine kernel"
            );
        }
        let call_stack = self.previous_kernel.public_inputs.end_non_revertible.public_call_stack;
        for i in 0..call_stack.len() {
            let call = call_stack[i];
            assert(
                call.is_empty(), "Non-revertible public call stack must be empty when executing in the public recombine kernel"
            );
        }

        let tx_nullifier = self.previous_kernel.public_inputs.end_non_revertible.new_nullifiers[0];
        assert(!is_empty(tx_nullifier), "Cannot have an empty tx nullifier in the public recombine kernel");
    }

    fn recombine_side_effects(self, public_inputs: &mut RollupKernelCircuitPublicInputsBuilder) {
        public_inputs.constants = self.previous_kernel.public_inputs.constants;

        for i in 0..MAX_NON_REVERTIBLE_COMMITMENTS_PER_TX {
            public_inputs.end.new_commitments.push(self.previous_kernel.public_inputs.end_non_revertible.new_commitments[i]);
        }

        for i in 0..MAX_REVERTIBLE_COMMITMENTS_PER_TX {
            public_inputs.end.new_commitments.push(self.previous_kernel.public_inputs.end.new_commitments[i]);
        }

        for i in 0..MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX {
            public_inputs.end.new_nullifiers.push(self.previous_kernel.public_inputs.end_non_revertible.new_nullifiers[i]);
        }

        for i in 0..MAX_REVERTIBLE_NULLIFIERS_PER_TX {
            public_inputs.end.new_nullifiers.push(self.previous_kernel.public_inputs.end.new_nullifiers[i]);
        }

        let start = self.previous_kernel.public_inputs.end;

        public_inputs.end = CombinedAccumulatedDataBuilder::recombine(self.previous_kernel.public_inputs.end_non_revertible, self.previous_kernel.public_inputs.end);
        // public_inputs.end.read_requests = array_to_bounded_vec(start.read_requests);
        // public_inputs.end.nullifier_key_validation_requests = array_to_bounded_vec(start.nullifier_key_validation_requests);
        // public_inputs.end.new_commitments = array_to_bounded_vec(start.new_commitments);
        // public_inputs.end.new_nullifiers = array_to_bounded_vec(start.new_nullifiers);
        // public_inputs.end.private_call_stack = array_to_bounded_vec(start.private_call_stack);
        // public_inputs.end.public_call_stack = array_to_bounded_vec(start.public_call_stack);
        // public_inputs.end.new_l2_to_l1_msgs = array_to_bounded_vec(start.new_l2_to_l1_msgs);
        // public_inputs.end.encrypted_logs_hash = start.encrypted_logs_hash;
        // public_inputs.end.unencrypted_logs_hash = start.unencrypted_logs_hash;
        // public_inputs.end.encrypted_log_preimages_length = start.encrypted_log_preimages_length;
        // public_inputs.end.unencrypted_log_preimages_length = start.unencrypted_log_preimages_length;
        // public_inputs.end.new_contracts = array_to_bounded_vec(start.new_contracts);
    }

    fn public_kernel_recombine(self) -> RollupKernelCircuitPublicInputs {
        // construct the circuit outputs
        let mut public_inputs: RollupKernelCircuitPublicInputsBuilder = unsafe::zeroed();

        // validate the inputs unique to having a previous private kernel
        self.validate_inputs();

        self.recombine_side_effects(&mut public_inputs);

        public_inputs.finish()
    }
}
