use crate::common;
use dep::types::abis::{
    kernel_circuit_public_inputs::{PublicKernelCircuitPublicInputs, PublicKernelCircuitPublicInputsBuilder},
    kernel_data::PublicKernelData
};
use dep::std::unsafe;

struct PublicKernelTailCircuitPrivateInputs {
    previous_kernel: PublicKernelData,
}

impl PublicKernelTailCircuitPrivateInputs {
    fn validate_inputs(self) {
        let needs_setup = self.previous_kernel.public_inputs.needs_setup;
        assert(needs_setup == false, "Previous kernel needs setup");
        let needs_app_logic = self.previous_kernel.public_inputs.needs_app_logic;
        assert(needs_app_logic == false, "Previous kernel needs app logic");
        let needs_teardown = self.previous_kernel.public_inputs.needs_teardown;
        assert(needs_teardown == false, "Previous kernel needs teardown");
    }

    fn public_kernel_tail(self) -> PublicKernelCircuitPublicInputs {
        // construct the circuit outputs
        let mut public_inputs: PublicKernelCircuitPublicInputsBuilder = unsafe::zeroed();

        // initialise the end state with our provided previous kernel state
        common::initialize_end_values(self.previous_kernel, &mut public_inputs);

        // validate the inputs unique to having a previous private kernel
        self.validate_inputs();

        public_inputs.to_inner()
    }
}

mod tests {
    use crate::{public_kernel_tail::PublicKernelTailCircuitPrivateInputs};
    use dep::types::{
        abis::{
        kernel_circuit_public_inputs::{PublicKernelCircuitPublicInputs, PublicKernelCircuitPublicInputsBuilder},
        kernel_data::PublicKernelData
    },
        tests::{kernel_data_builder::PreviousKernelDataBuilder}
    };

    struct PublicKernelTailCircuitPrivateInputsBuilder {
        previous_kernel: PreviousKernelDataBuilder,
    }

    impl PublicKernelTailCircuitPrivateInputsBuilder {
        pub fn new() -> Self {
            let previous_kernel = PreviousKernelDataBuilder::new(true);

            PublicKernelTailCircuitPrivateInputsBuilder { previous_kernel }
        }

        pub fn execute(&mut self) -> PublicKernelCircuitPublicInputs {
            let previous_kernel = self.previous_kernel.to_public_kernel_data();

            let kernel = PublicKernelTailCircuitPrivateInputs { previous_kernel };

            kernel.public_kernel_tail()
        }

        pub fn succeeded(&mut self) {
            let _ = self.execute();
        }

        pub fn failed(&mut self) {
            let _ = self.execute();
        }
    }

    #[test]
    fn public_kernel_circuit_tail_succeeds() {
        let mut builder = PublicKernelTailCircuitPrivateInputsBuilder::new();
        builder.succeeded();
    }
}
