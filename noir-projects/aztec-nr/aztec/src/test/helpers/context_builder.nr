use crate::context::{PrivateContext, PublicContext};
use crate::test::helpers::cheatcodes;
use dep::protocol_types::address::AztecAddress;

struct ContextBuilder {
    block_number: Option<Field>,
    contract_address: Option<AztecAddress>,
}

impl ContextBuilder {
    fn new() -> Self {
        Self { block_number: Option::none(), contract_address: Option::none() }
    }

    fn block_number(&mut self, block_number: Field) -> &mut Self {
        self.block_number = Option::some(block_number);
        self
    }

    fn contract_address(&mut self, contract_address: AztecAddress) -> &mut Self {
        self.contract_address = Option::some(contract_address);
        self
    }

    fn private(self) -> PrivateContext {
        cheatcodes::reset();
        let mut context = PrivateContext::empty();

        if self.block_number.is_some() {
            let block_number = self.block_number.unwrap_unchecked();
            context.inputs.historical_header.global_variables.block_number = block_number;
            cheatcodes::advance_block_to(block_number);
        }

        if self.contract_address.is_some() {
            let contract_address = self.contract_address.unwrap_unchecked();
            context.inputs.call_context.storage_contract_address = contract_address;
            cheatcodes::set_contract_address(contract_address);
        }

        context
    }

    fn public(self) -> PublicContext {
        cheatcodes::reset();
        let mut context = PublicContext::empty();

        if self.block_number.is_some() {
            let block_number = self.block_number.unwrap_unchecked();
            cheatcodes::advance_block_to(block_number);
        }

        if self.contract_address.is_some() {
            let contract_address = self.contract_address.unwrap_unchecked();
            cheatcodes::set_contract_address(contract_address);
        }

        context
    }
}
