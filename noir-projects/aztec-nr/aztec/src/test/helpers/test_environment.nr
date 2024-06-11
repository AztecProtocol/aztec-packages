use dep::protocol_types::{
    abis::function_selector::FunctionSelector, address::{AztecAddress, PartialAddress},
    storage::map::derive_storage_slot_in_map, constants::CANONICAL_KEY_REGISTRY_ADDRESS,
    grumpkin_point::GrumpkinPoint
};

use crate::oracle::unsafe_rand::unsafe_rand;

use crate::context::{PrivateContext, PublicContext, PrivateVoidCallInterface};
use crate::test::helpers::{cheatcodes, types::{Deployer, TestAccount}};
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

    fn store_master_key(self, key_index: Field, address: AztecAddress, key: GrumpkinPoint) {
        let x_coordinate_map_slot = key_index * 2 + 1;
        let y_coordinate_map_slot = x_coordinate_map_slot + 1;
        let x_coordinate_derived_slot = derive_storage_slot_in_map(x_coordinate_map_slot, address);
        let y_coordinate_derived_slot = derive_storage_slot_in_map(y_coordinate_map_slot, address);

        let canonical_registry_address = AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS);

        cheatcodes::direct_storage_write(canonical_registry_address, x_coordinate_derived_slot, [key.x]);

        cheatcodes::direct_storage_write(canonical_registry_address, y_coordinate_derived_slot, [key.y]);
    }

    fn get_account(self) -> AztecAddress {
        let test_account = cheatcodes::add_account(unsafe_rand());
        let address = test_account.address;
        let keys = test_account.keys;

        self.store_master_key(NULLIFIER_INDEX, address, keys.npk_m);
        self.store_master_key(INCOMING_INDEX, address, keys.ivpk_m);
        self.store_master_key(OUTGOING_INDEX, address, keys.ovpk_m);
        self.store_master_key(TAGGING_INDEX, address, keys.tpk_m);

        test_account.address
    }

    fn deploy<N>(self, path: str<N>) -> Deployer<N> {
        Deployer { path }
    }
}
