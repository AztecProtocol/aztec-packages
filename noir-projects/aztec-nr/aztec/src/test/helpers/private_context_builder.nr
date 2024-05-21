use crate::context::PrivateContext;
use dep::protocol_types::address::AztecAddress;

struct PrivateContextBuilder {
        contract_address: Option<AztecAddress>,
    }

impl PrivateContextBuilder {
    fn new() -> Self {
        Self { contract_address: Option::none() }
    }

    fn contract_address(&mut self, contract_address: AztecAddress) -> &mut Self {
        self.contract_address = Option::some(contract_address);
        self
    }

    fn build(&mut self) -> PrivateContext {
        let mut context = PrivateContext::empty();

        if self.contract_address.is_some() {
            context.inputs.call_context.storage_contract_address = self.contract_address.unwrap();
        }

        context
    }
}
