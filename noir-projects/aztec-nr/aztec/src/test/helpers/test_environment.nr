use dep::protocol_types::{
    abis::function_selector::FunctionSelector, address::{AztecAddress, PartialAddress},
    storage::map::derive_storage_slot_in_map, constants::CANONICAL_KEY_REGISTRY_ADDRESS,
    grumpkin_point::GrumpkinPoint
};

use crate::context::{PrivateContext, PublicContext, PrivateVoidCallInterface};
use crate::test::helpers::cheatcodes;
use crate::keys::{public_keys::PublicKeys, constants::{NULLIFIER_INDEX, INCOMING_INDEX, OUTGOING_INDEX, TAGGING_INDEX}};

struct TestEnvironment {
    block_number: u32,
    contract_address: Option<AztecAddress>,
    args_hash: Option<Field>,
    function_selector: Option<FunctionSelector>
}

impl TestEnvironment {
    fn new() -> Self {
        cheatcodes::reset();

        Self {
            block_number: 1,
            contract_address: Option::none(),
            args_hash: Option::none(),
            function_selector: Option::none()
        }
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
        let difference = block_number - self.block_number;
        self.advance_block_by(difference);
    }

    fn advance_block_by(&mut self, blocks: u32) {
        self.block_number += blocks;
        cheatcodes::advance_blocks(blocks);
    }

    fn public(self) -> PublicContext {
        if (self.contract_address.is_some()) {
            cheatcodes::set_contract_address(self.contract_address.unwrap_unchecked());
        }

        PublicContext::empty()
    }

    fn private(&mut self) -> PrivateContext {
        self.private_at(self.block_number)
    }

    fn private_at(&mut self, historical_block_number: u32) -> PrivateContext {
        if historical_block_number >= self.block_number {
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

    fn store_master_key(self, key_index: Field, address: AztecAddress) -> GrumpkinPoint {
        let x_coordinate_map_slot = key_index * 2 + 1;
        let y_coordinate_map_slot = x_coordinate_map_slot + 1;
        let x_coordinate_derived_slot = derive_storage_slot_in_map(x_coordinate_map_slot, address);
        let y_coordinate_derived_slot = derive_storage_slot_in_map(y_coordinate_map_slot, address);

        let canonical_registry_address = AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS);

        let fake_key = GrumpkinPoint { x: 1, y: 2 };

        cheatcodes::direct_storage_write(
            canonical_registry_address,
            x_coordinate_derived_slot,
            [fake_key.x]
        );

        cheatcodes::direct_storage_write(
            canonical_registry_address,
            y_coordinate_derived_slot,
            [fake_key.y]
        );
        fake_key
    }

    fn get_address_with_keys(self, address: AztecAddress) -> AztecAddress {
        let keys = PublicKeys {
            npk_m: self.store_master_key(NULLIFIER_INDEX, address),
            ivpk_m: self.store_master_key(INCOMING_INDEX, address),
            ovpk_m: self.store_master_key(OUTGOING_INDEX, address),
            tpk_m: self.store_master_key(TAGGING_INDEX, address)
        };

        AztecAddress::compute(keys.hash(), PartialAddress::from_field(1))
    }
}
