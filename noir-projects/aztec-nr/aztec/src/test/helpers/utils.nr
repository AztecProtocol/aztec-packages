use dep::protocol_types::{
    traits::{Deserialize, Serialize}, address::AztecAddress,
    public_keys::{PublicKeys, PUBLIC_KEYS_LENGTH}, abis::{function_selector::FunctionSelector},
    contract_instance::ContractInstance
};

use crate::context::{PrivateContext, PublicContext, UnconstrainedContext, inputs::PrivateContextInputs};
use crate::context::call_interfaces::{PublicCallInterface, CallInterface};
use crate::test::helpers::cheatcodes;

use crate::oracle::{execution::{get_block_number, get_contract_address}};
use protocol_types::constants::PUBLIC_DISPATCH_SELECTOR;
use crate::context::gas::GasOpts;
use crate::context::call_interfaces::PublicVoidCallInterface;
use crate::hash::hash_args;
use crate::oracle::arguments::pack_arguments;

pub struct Deployer<let N: u32, let M: u32> {
    path: str<N>,
    name: str<M>,
    public_keys_hash: Field
}

impl<let N: u32, let M: u32> Deployer<N, M> {
    unconstrained pub fn with_private_initializer<C, let P: u32>(
        self,
        call_interface: C
    ) -> ContractInstance where C: CallInterface<P> {
        let instance = cheatcodes::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.public_keys_hash
        );
        cheatcodes::advance_blocks_by(1);
        let inputs = cheatcodes::get_private_context_inputs(get_block_number() - 1);
        let mut private_context = PrivateContext::new(inputs, 0);
        let args = call_interface.get_args();
        let args_hash = if args.len() > 0 { hash_args(args) } else { 0 };
        pack_arguments(args);
        let _ = private_context.call_private_function_with_packed_args(
            instance.to_address(),
            call_interface.get_selector(),
            args_hash,
            call_interface.get_is_static(),
            false
        );

        instance
    }

    unconstrained pub fn with_public_void_initializer<let P: u32, C>(
        self,
        call_interface: C
    ) -> ContractInstance where C: CallInterface<P> {
        let instance = cheatcodes::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.public_keys_hash
        );
        cheatcodes::advance_blocks_by(1);

        let mut public_context = PublicContext::new(|| {panic( f"Provide args hash manually")});

        public_context.call_public_function(
            instance.to_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            GasOpts::default()
        ).assert_empty();

        instance
    }

    unconstrained pub fn with_public_initializer<let P: u32, T, C>(
        self,
        call_interface: C
    ) -> ContractInstance where C: CallInterface<P>, T: Deserialize<_> {
        let instance = cheatcodes::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.public_keys_hash
        );
        cheatcodes::advance_blocks_by(1);

        let mut public_context = PublicContext::new(|| {panic( f"Provide args hash manually")});

        let _: T = public_context.call_public_function(
            instance.to_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            GasOpts::default()
        ).deserialize_into();

        instance
    }

    unconstrained pub fn without_initializer(self) -> ContractInstance {
        cheatcodes::deploy(self.path, self.name, "", &[], self.public_keys_hash)
    }
}

// Keys length + address
global TEST_ACCOUNT_LENGTH = PUBLIC_KEYS_LENGTH + 1;

pub struct TestAccount {
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
