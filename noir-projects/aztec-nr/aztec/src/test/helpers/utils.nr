use dep::protocol_types::{
    traits::{Deserialize, Serialize}, address::AztecAddress,
    abis::{private_circuit_public_inputs::PrivateCircuitPublicInputs},
    contract_instance::ContractInstance
};

use crate::context::inputs::PrivateContextInputs;
use crate::context::call_interfaces::CallInterface;
use crate::test::helpers::cheatcodes;
use crate::keys::public_keys::{PUBLIC_KEYS_LENGTH, PublicKeys};

use crate::oracle::execution::{get_block_number, get_contract_address};

unconstrained pub fn apply_side_effects_private(contract_address: AztecAddress, public_inputs: PrivateCircuitPublicInputs) {
    let mut nullifiers = &[];
    for nullifier in public_inputs.nullifiers {
        if nullifier.value != 0 {
            nullifiers = nullifiers.push_back(nullifier.value);
        }
    }
    cheatcodes::add_nullifiers(contract_address, nullifiers);
    let mut note_hashes = &[];
    for note_hash in public_inputs.note_hashes {
        if note_hash.value != 0 {
            note_hashes = note_hashes.push_back(note_hash.value);
        }
    }
    cheatcodes::add_note_hashes(contract_address, note_hashes);
}

pub struct Deployer<let N: u32, let M: u32> {
    path: str<N>,
    name: str<M>,
    // TODO(ek): Calculate the public keys hash here instead of passing in the secret key
    public_keys_hash: Field,
    secret: Field,
}

impl<let N: u32, let M: u32> Deployer<N, M> {
    unconstrained pub fn with_private_initializer<C, let P: u32, Env>(
        self,
        call_interface: C
    ) -> ContractInstance where C: CallInterface<P, PrivateContextInputs, PrivateCircuitPublicInputs, Env> {
        let instance = cheatcodes::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.public_keys_hash,
            self.secret,
        );
        let address = instance.to_address();
        cheatcodes::advance_blocks_by(1);
        let block_number = get_block_number();
        let original_fn = call_interface.get_original();
        let original_msg_sender = cheatcodes::get_msg_sender();
        let original_contract_address = get_contract_address();

        cheatcodes::set_contract_address(address);
        cheatcodes::set_msg_sender(original_contract_address);
        let mut inputs = cheatcodes::get_private_context_inputs(block_number - 1);
        inputs.call_context.function_selector = call_interface.get_selector();
        let public_inputs = original_fn(inputs);
        apply_side_effects_private(address, public_inputs);
        cheatcodes::advance_blocks_by(1);
        cheatcodes::set_contract_address(original_contract_address);
        cheatcodes::set_msg_sender(original_msg_sender);
        instance
    }

    unconstrained pub fn with_public_initializer<C, let P: u32, T, Env>(
        self,
        call_interface: C
    ) -> ContractInstance where C: CallInterface<P, (), T, Env> {
        let instance = cheatcodes::deploy(
            self.path,
            self.name,
            call_interface.get_name(),
            call_interface.get_args(),
            self.public_keys_hash,
            self.secret,
        );
        cheatcodes::advance_blocks_by(1);
        let original_fn = call_interface.get_original();
        let original_msg_sender = cheatcodes::get_msg_sender();
        let original_contract_address = get_contract_address();
        let original_fn_selector = cheatcodes::get_function_selector();
        let calldata = call_interface.get_args();

        cheatcodes::set_fn_selector(call_interface.get_selector());
        cheatcodes::set_contract_address(instance.to_address());
        cheatcodes::set_msg_sender(original_contract_address);
        cheatcodes::set_is_static_call(call_interface.get_is_static());
        cheatcodes::set_calldata(calldata);

        let _result: T = original_fn(());

        cheatcodes::set_fn_selector(original_fn_selector);
        cheatcodes::set_contract_address(original_contract_address);
        cheatcodes::set_msg_sender(original_msg_sender);
        cheatcodes::set_calldata(calldata);
        cheatcodes::set_is_static_call(call_interface.get_is_static());
        instance
    }

    unconstrained pub fn without_initializer(self) -> ContractInstance {
        cheatcodes::deploy(self.path, self.name, "", &[], self.public_keys_hash, self.secret)
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
