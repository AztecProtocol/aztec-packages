use dep::aztec::prelude::{AztecAddress, EthAddress, FunctionSelector, PrivateContext};
use dep::aztec::context::PublicContext;

use dep::aztec::protocol_types::constants::RETURN_VALUES_LENGTH;

struct Token {
  address: AztecAddress,
}

impl Token {
    pub fn at(address: AztecAddress) -> Self {
        Self { address }
    }

    pub fn split_into_partial_notes_pair(
        self: Self,
        context: &mut PrivateContext,
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field
    ) -> [Field; RETURN_VALUES_LENGTH] {
        context.call_private_function(
            self.address,
            FunctionSelector::from_signature("split_into_partial_notes_pair((Field),(Field),Field,Field)"),
            [from.to_field(), to.to_field(), amount, nonce]
        )
    }

    pub fn complete_partial_notes_pair(
        self: Self,
        context: &mut PublicContext,
        partial_note_hashes: [Field; 2],
        amounts: [Field; 2]
    ) {
        let _ = context.call_public_function(
            self.address,
            FunctionSelector::from_signature("complete_partial_notes_pair([Field;2],[Field;2])"),
            [partial_note_hashes[0], partial_note_hashes[1], amounts[0], amounts[1]]
        );
    }

    pub fn transfer_public(
        self: Self,
        context: PublicContext,
        from: AztecAddress,
        to: AztecAddress,
        amount: Field,
        nonce: Field
    ) {
        let _ = context.call_public_function(
            self.address,
            FunctionSelector::from_signature("transfer_public((Field),(Field),Field,Field)"),
            [from.to_field(), to.to_field(), amount, nonce]
        );
    }
}
