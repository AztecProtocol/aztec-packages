use dep::aztec::protocol_types::{abis::function_selector::FunctionSelector, address::{AztecAddress, EthAddress}};
use dep::aztec::{context::{PrivateContext, PublicContext}};

struct Token {
  address: AztecAddress,
}

impl Token {
    pub fn at(address: AztecAddress) -> Self {
        Self { address }
    }

    pub fn transfer(
        self: Self,
        context: &mut PrivateContext,
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field
    ) {
        let _ret = context.call_private_function(
            self.address,
            FunctionSelector::from_signature("transfer((Field),(Field),Field,Field)"),
            [from.to_field(), to.to_field(), amount, nonce]
        );
    }
}

struct PrivateToken {
  address: AztecAddress,
}

impl PrivateToken {
    pub fn at(address: AztecAddress) -> Self {
        Self { address }
    }

    pub fn mint(self: Self, context: &mut PrivateContext, amount: u64, recipient: AztecAddress) {
        let _ret = context.call_private_function(
            self.address,
            FunctionSelector::from_signature("mint(u120,(Field))"),
            [amount as Field, recipient.to_field()]
        );
    }
}
