use dep::protocol_types::address::AztecAddress;
use crate::context::{PrivateContext, PublicContext};
use crate::test::helpers::cheatcodes;

struct TestEnvironment {
    block_number: u32,
    contract_address: Option<AztecAddress>,
}

impl TestEnvironment {
    fn new() -> Self {
        cheatcodes::reset();

        Self { block_number: 1, contract_address: Option::none() }
    }

    fn contract_address(&mut self, contract_address: AztecAddress) -> Self {
        self.contract_address = Option::some(contract_address);
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
        let args_hash = 0;

        if (self.contract_address.is_some()) {
            inputs.call_context.storage_contract_address = self.contract_address.unwrap_unchecked();
        }

        PrivateContext::new(inputs, args_hash)
    }
}
