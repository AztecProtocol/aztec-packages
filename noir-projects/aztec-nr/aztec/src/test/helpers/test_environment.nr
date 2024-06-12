use dep::protocol_types::{
    abis::{function_selector::FunctionSelector, private_circuit_public_inputs::PrivateCircuitPublicInputs},
    address::{AztecAddress, PartialAddress}, storage::map::derive_storage_slot_in_map,
    constants::CANONICAL_KEY_REGISTRY_ADDRESS, grumpkin_point::GrumpkinPoint, traits::Deserialize
};

use crate::context::inputs::{PublicContextInputs, PrivateContextInputs};
use crate::context::{packed_returns::PackedReturns, call_interfaces::CallInterface};

use crate::context::{PrivateContext, PublicContext, PrivateVoidCallInterface};
use crate::test::helpers::{cheatcodes, types::{Deployer, TestAccount}, keys};
use crate::keys::constants::{NULLIFIER_INDEX, INCOMING_INDEX, OUTGOING_INDEX, TAGGING_INDEX};

struct TestEnvironment {
    contract_address: Option<AztecAddress>,
    args_hash: Option<Field>,
    function_selector: Option<FunctionSelector>
}

impl TestEnvironment {
    fn new() -> Self {
        cheatcodes::reset();

        Self { contract_address: Option::none(), args_hash: Option::none(), function_selector: Option::none() }
    }

    fn block_number(self) -> u32 {
        cheatcodes::get_block_number()
    }

    fn contract_address(&mut self, contract_address: AztecAddress) -> Self {
        self.contract_address = Option::some(contract_address);
        *self
    }

    fn function_selector(&mut self, function_selector: FunctionSelector) -> Self {
        self.function_selector = Option::some(function_selector);
        *self
    }

    fn args_hash(&mut self, args_hash: Field) -> Self {
        self.args_hash = Option::some(args_hash);
        *self
    }

    fn advance_block_to(&mut self, block_number: u32) {
        let difference = block_number - cheatcodes::get_block_number();
        self.advance_block_by(difference);
    }

    fn advance_block_by(&mut self, blocks: u32) {
        cheatcodes::advance_blocks(blocks);
    }

    fn public(self) -> PublicContext {
        if (self.contract_address.is_some()) {
            cheatcodes::set_contract_address(self.contract_address.unwrap_unchecked());
        }

        PublicContext::empty()
    }

    fn private(&mut self) -> PrivateContext {
        self.private_at(cheatcodes::get_block_number())
    }

    fn private_at(&mut self, historical_block_number: u32) -> PrivateContext {
        if historical_block_number >= cheatcodes::get_block_number() {
            self.advance_block_to(historical_block_number + 1);
        }

        let mut inputs = cheatcodes::get_private_context_inputs(historical_block_number);

        if (self.contract_address.is_some()) {
            inputs.call_context.storage_contract_address = self.contract_address.unwrap_unchecked();
        }

        if (self.function_selector.is_some()) {
            inputs.call_context.function_selector = self.function_selector.unwrap_unchecked();
        }

        let mut args_hash = 0;

        if (self.args_hash.is_some()) {
            args_hash = self.args_hash.unwrap_unchecked();
        }

        PrivateContext::new(inputs, args_hash)
    }

    fn create_account(self) -> AztecAddress {
        let test_account = cheatcodes::create_account();
        let address = test_account.address;
        let keys = test_account.keys;

        keys::store_master_key(NULLIFIER_INDEX, address, keys.npk_m);
        keys::store_master_key(INCOMING_INDEX, address, keys.ivpk_m);
        keys::store_master_key(OUTGOING_INDEX, address, keys.ovpk_m);
        keys::store_master_key(TAGGING_INDEX, address, keys.tpk_m);

        test_account.address
    }

    fn deploy<N>(self, path: str<N>) -> Deployer<N> {
        Deployer { path }
    }

    fn call_private<C, M, T, Env, N>(
        self,
        call_interface: C
    ) -> T where C: CallInterface<M, PrivateContextInputs, PrivateCircuitPublicInputs, Env>, T: Deserialize<N> {
        let original_fn = call_interface.get_original();
        let mut inputs = cheatcodes::get_private_context_inputs(cheatcodes::get_block_number() - 1);
        let public_inputs = original_fn(inputs);
        PackedReturns::new(public_inputs.returns_hash).unpack_into()
    }
}
