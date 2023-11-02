use crate::abis::public_call_data::PublicCallData;
use dep::types::abis::previous_kernel_data::PreviousKernelData;
use dep::types::abis::kernel_circuit_public_inputs::KernelCircuitPublicInputs;
use crate::common;
// translated from cpp impl in 
// aztec-packages/circuits/cpp/src/aztec3/circuits/kernel/public/native_public_kernel_circuit_private_previous_kernel.cpp

struct PublicKernelPrivatePreviousInputs {
    previous_kernel: PreviousKernelData,
    public_call: PublicCallData,
}

impl PublicKernelPrivatePreviousInputs {

    fn validate_inputs(self) {
        let private_call_stack = self.previous_kernel.public_inputs.end.private_call_stack;
        assert(private_call_stack ==0,
                      "Private call stack must be empty when executing in the public kernel (i.e. all private calls must have been completed)");

        let previous_call_is_private = self.previous_kernel.public_inputs.is_private;
        assert(previous_call_is_private == true,
            "Previous kernel must be private when in this public kernel version");
    }


    fn public_kernel_private_previous(self) -> KernelCircuitPublicInputs {
        // construct the circuit outputs
        let mut public_inputs: KernelCircuitPublicInputsBuilder = unsafe::zerod();

        // initialise the end state with our provided previous kernel state
        common::initialize_end_values(self.previous_kernel, &mut public_inputs);

        // validate the inputs common to all invocation circumstances
        common::validate_inputs(self.public_call);

        // validate the inputs unique to having a previous private kernel
        self.validate_inputs();

        // to implement:
        // validate the kernel execution common to all invocation circumstances
        common::validate_kernel_execution(self.public_call);

        // validate our public call hash
        validate_this_public_call_hash(public_kernel_inputs, public_inputs);

        common::update_public_end_values(public_kernel_inputs, public_inputs);

        common::accumulate_unencrypted_logs(public_kernel_inputs, public_inputs);

        public_inputs.finish();
    }
}