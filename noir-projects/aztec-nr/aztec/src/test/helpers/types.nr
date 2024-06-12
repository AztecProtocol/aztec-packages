use dep::protocol_types::{
    traits::{Deserialize, Serialize}, address::AztecAddress,
    abis::{function_selector::FunctionSelector, private_circuit_public_inputs::PrivateCircuitPublicInputs}
};

use crate::context::inputs::{PublicContextInputs, PrivateContextInputs};
use crate::context::call_interfaces::CallInterface;
use crate::test::helpers::cheatcodes;
use crate::keys::public_keys::{PUBLIC_KEYS_LENGTH, PublicKeys};

struct Deployer<N> {
        path: str<N>,
    }

impl<N> Deployer<N> {
    pub fn with_private_initializer<C, M, Env>(
        self,
        call_interface: C
    ) -> AztecAddress where C: CallInterface<M, PrivateContextInputs, PrivateCircuitPublicInputs, Env> {
        let address = cheatcodes::deploy(
            self.path,
            call_interface.get_name(),
            call_interface.get_args()
        );
        cheatcodes::advance_blocks(1);
        let block_number = cheatcodes::get_block_number();
        let original_fn = call_interface.get_original();
        let mut inputs = cheatcodes::get_private_context_inputs(block_number - 1);
        inputs.call_context.storage_contract_address = address;
        inputs.call_context.function_selector = call_interface.get_selector();
        let _result = original_fn(inputs);
        address
    }

    pub fn with_public_initializer<C, M, T, Env>(
        self,
        call_interface: C
    ) -> AztecAddress where C: CallInterface<M, PublicContextInputs, T, Env> {
        let address = cheatcodes::deploy(
            self.path,
            call_interface.get_name(),
            call_interface.get_args()
        );
        let original_fn = call_interface.get_original();
        let mut inputs = cheatcodes::get_public_context_inputs();
        let _result = original_fn(inputs);
        address
    }

    pub fn without_initializer(self) -> AztecAddress {
        let address = cheatcodes::deploy(self.path, "", &[]);
        address
    }
}

// Keys length + address
global TEST_ACCOUNT_LENGTH = PUBLIC_KEYS_LENGTH + 1;

struct TestAccount {
    address: AztecAddress,
    keys: PublicKeys
}

impl Serialize<TEST_ACCOUNT_LENGTH> for TestAccount {
    fn serialize(self) -> [Field; TEST_ACCOUNT_LENGTH] {
        let mut output = [0; TEST_ACCOUNT_LENGTH];

        output[0] = self.address.to_field();

        for i in 0..PUBLIC_KEYS_LENGTH {
            output[i+1] = self.keys.serialize()[i];
        }
        output
    }
}

impl Deserialize<TEST_ACCOUNT_LENGTH> for TestAccount {
    fn deserialize(input: [Field; TEST_ACCOUNT_LENGTH]) -> Self {
        let address = AztecAddress::from_field(input[0]);
        let mut key_buffer = [0; PUBLIC_KEYS_LENGTH];
        for i in 0..PUBLIC_KEYS_LENGTH {
            key_buffer[i] = input[i+1];
        }
        let keys = PublicKeys::deserialize(key_buffer);

        Self { address, keys }
    }
}
