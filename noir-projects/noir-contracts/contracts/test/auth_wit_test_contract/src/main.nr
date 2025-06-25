use dep::aztec::macros::aztec;

#[aztec]
pub contract AuthWitTest {
    use dep::aztec::{
        authwit::auth::{assert_inner_hash_valid_authwit, assert_inner_hash_valid_authwit_public},
        macros::functions::{private, public},
        protocol_types::address::AztecAddress,
    };

    #[private]
    fn consume(on_behalf_of: AztecAddress, inner_hash: Field) {
        assert_inner_hash_valid_authwit(&mut context, on_behalf_of, inner_hash);
    }

    #[public]
    fn consume_public(on_behalf_of: AztecAddress, inner_hash: Field) {
        assert_inner_hash_valid_authwit_public(&mut context, on_behalf_of, inner_hash);
    }
}
