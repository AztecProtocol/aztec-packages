use aztec::macros::aztec;

#[aztec]
pub contract ExternalCall {
    use aztec::{
        macros::functions::private,
        protocol_types::address::AztecAddress,
    };

    use dep::starter_token::StarterToken;

    #[private]
    fn call_mint_on_other_contract(contract_address: AztecAddress, to: AztecAddress, amount: u128) {
        StarterToken::at(contract_address).mint_private(to, amount).call(&mut context);
    }
}
