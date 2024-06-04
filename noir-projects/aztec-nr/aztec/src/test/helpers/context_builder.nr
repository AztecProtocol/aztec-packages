use crate::context::{PrivateContext, PublicContext};
use crate::test::helpers::cheatcodes;
use dep::protocol_types::address::AztecAddress;

use dep::protocol_types::debug_log;

struct ContextBuilder {
    block_number: Option<u32>,
    contract_address: Option<AztecAddress>,
}

impl ContextBuilder {
    fn new() -> Self {
        Self { block_number: Option::none(), contract_address: Option::none() }
    }

    fn block_number(&mut self, block_number: u32) -> &mut Self {
        self.block_number = Option::some(block_number);
        self
    }

    fn contract_address(&mut self, contract_address: AztecAddress) -> &mut Self {
        self.contract_address = Option::some(contract_address);
        self
    }

    fn private(self) -> PrivateContext {
        let inputs = cheatcodes::get_private_context_inputs(self.block_number.unwrap());

        let args_hash = 0;
        PrivateContext::new(inputs, args_hash)
    }

    fn public(self) -> PublicContext {
        let mut context = PublicContext::empty();

        if self.block_number.is_some() {
            cheatcodes::advance_block_to(self.block_number.unwrap_unchecked());
        }

        if self.contract_address.is_some() {
            cheatcodes::set_contract_address(self.contract_address.unwrap_unchecked());
        }

        context
    }
}
