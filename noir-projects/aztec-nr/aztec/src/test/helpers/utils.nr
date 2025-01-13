use dep::protocol_types::{
    address::AztecAddress,
    contract_instance::ContractInstance,
    public_keys::{PUBLIC_KEYS_LENGTH, PublicKeys},
    traits::{Deserialize, Serialize},
};

use crate::context::call_interfaces::CallInterface;
use crate::context::{PrivateContext, PublicContext};
use crate::test::helpers::cheatcodes;

use crate::context::gas::GasOpts;
use crate::hash::hash_args;
use crate::oracle::arguments::pack_arguments;
use crate::oracle::execution::get_block_number;

pub struct Deployer<let N: u32, let M: u32> {
    pub path: str<N>,
    pub name: str<M>,
    pub public_keys_hash: Field,
}

impl<let N: u32, let M: u32> Deployer<N, M> {
    pub unconstrained fn with_private_initializer<C, let P: u32>(
        self,
        call_interface: C,
    ) -> ContractInstance
    where
        C: CallInterface<P>,
    {
        let instance = cheatcodes::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.public_keys_hash,
        );
        cheatcodes::advance_blocks_by(1);
        let inputs = cheatcodes::get_private_context_inputs(get_block_number() - 1);
        let mut private_context = PrivateContext::new(inputs, 0);
        let args = call_interface.get_args();
        let args_hash = if args.len() > 0 { hash_args(args) } else { 0 };
        pack_arguments(args);
        let _ = private_context.call_private_function_with_args_hash(
            instance.to_address(),
            call_interface.get_selector(),
            args_hash,
            call_interface.get_is_static(),
        );

        instance
    }

    pub unconstrained fn with_public_void_initializer<let P: u32, C>(
        self,
        call_interface: C,
    ) -> ContractInstance
    where
        C: CallInterface<P>,
    {
        let instance = cheatcodes::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.public_keys_hash,
        );
        cheatcodes::advance_blocks_by(1);

        let mut public_context = PublicContext::new(|| panic(f"Provide args hash manually"));

        let results = public_context.call_public_function(
            instance.to_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            GasOpts::default(),
        );
        assert(results.len() == 0);

        instance
    }

    pub unconstrained fn with_public_initializer<let P: u32, T, C>(
        self,
        call_interface: C,
    ) -> ContractInstance
    where
        C: CallInterface<P>,
        T: Deserialize<_>,
    {
        let instance = cheatcodes::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.public_keys_hash,
        );
        cheatcodes::advance_blocks_by(1);

        let mut public_context = PublicContext::new(|| panic(f"Provide args hash manually"));

        let _ = public_context.call_public_function(
            instance.to_address(),
            call_interface.get_selector(),
            call_interface.get_args(),
            GasOpts::default(),
        );

        instance
    }

    pub unconstrained fn without_initializer(self) -> ContractInstance {
        cheatcodes::deploy(self.path, self.name, "", &[], self.public_keys_hash)
    }
}

// Keys length + address
global TEST_ACCOUNT_LENGTH: u32 = PUBLIC_KEYS_LENGTH + 1;

pub struct TestAccount {
    pub address: AztecAddress,
    pub keys: PublicKeys,
}

impl Serialize<TEST_ACCOUNT_LENGTH> for TestAccount {
    fn serialize(self) -> [Field; TEST_ACCOUNT_LENGTH] {
        let mut output = [0; TEST_ACCOUNT_LENGTH];

        output[0] = self.address.to_field();

        for i in 0..PUBLIC_KEYS_LENGTH {
            output[i + 1] = self.keys.serialize()[i];
        }
        output
    }
}

impl Deserialize<TEST_ACCOUNT_LENGTH> for TestAccount {
    fn deserialize(input: [Field; TEST_ACCOUNT_LENGTH]) -> Self {
        let address = AztecAddress::from_field(input[0]);
        let mut key_buffer = [0; PUBLIC_KEYS_LENGTH];
        for i in 0..PUBLIC_KEYS_LENGTH {
            key_buffer[i] = input[i + 1];
        }
        let keys = PublicKeys::deserialize(key_buffer);

        Self { address, keys }
    }
}
