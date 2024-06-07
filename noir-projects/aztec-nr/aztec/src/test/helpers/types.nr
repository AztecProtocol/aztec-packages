use dep::protocol_types::address::AztecAddress;

use crate::context::inputs::{PublicContextInputs, PrivateContextInputs};
use crate::context::call_interfaces::CallInterface;
use crate::test::helpers::cheatcodes::{get_private_context_inputs, get_public_context_inputs, deploy_inner};

struct Deployer<N> {
        path: str<N>,
    }

impl<N> Deployer<N> {
    pub fn with_private_initializer<C, M, T, P, Env>(
        self,
        call_interface: C,
        historical_block_number: u32
    ) -> AztecAddress where C: CallInterface<M, PrivateContextInputs, P, Env> {
        let address = deploy_inner(
            self.path,
            call_interface.get_name(),
            call_interface.get_args()
        );
        let original_fn = call_interface.get_original();
        let mut inputs = get_private_context_inputs(historical_block_number);
        inputs.call_context.storage_contract_address = address;
        inputs.call_context.function_selector = call_interface.get_selector();
        let _result = original_fn(inputs);
        address
    }

    pub fn with_public_initializer<C, M, T, P, Env>(
        self,
        call_interface: C
    ) -> AztecAddress where C: CallInterface<M, PublicContextInputs, P, Env> {
        let address = deploy_inner(
            self.path,
            call_interface.get_name(),
            call_interface.get_args()
        );
        let original_fn = call_interface.get_original();
        let mut inputs = get_public_context_inputs();
        let _result = original_fn(inputs);
        address
    }
}
