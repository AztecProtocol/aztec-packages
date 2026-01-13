mod private_call_data;
mod output_composition_tests;
mod proof_and_vk_tests;

use crate::private_kernel_inner::{self, PrivateKernelInnerCircuitPrivateInputs};
use dep::types::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    constants::PRIVATE_KERNEL_INIT_VK_INDEX, tests::fixture_builder::FixtureBuilder,
};

struct TestBuilder {
    previous_kernel: FixtureBuilder,
    private_call: FixtureBuilder,
}

impl TestBuilder {
    pub fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new_from_counter(135)
            .in_vk_tree(PRIVATE_KERNEL_INIT_VK_INDEX)
            .as_parent_contract();
        previous_kernel.compute_update_tree_and_hints();

        let mut private_call = FixtureBuilder::new_from_counter(2468);
        private_call.compute_update_tree_and_hints();
        private_call.anchor_block_header = previous_kernel.anchor_block_header;

        TestBuilder { previous_kernel, private_call }
    }

    pub fn new_static_call() -> Self {
        let mut builder = TestBuilder::new();
        let _ = builder.private_call.is_static_call();
        builder
    }

    pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
        let private_call = self.private_call.to_private_call_data();
        let private_call_request = self.private_call.to_private_call_request();

        let mut previous_kernel_builder = self.previous_kernel;
        previous_kernel_builder.private_call_requests.push(private_call_request);
        let previous_kernel = previous_kernel_builder.to_private_kernel_data();

        let private_inputs =
            PrivateKernelInnerCircuitPrivateInputs { previous_kernel, private_call };

        private_kernel_inner::execute(private_inputs)
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }
}
