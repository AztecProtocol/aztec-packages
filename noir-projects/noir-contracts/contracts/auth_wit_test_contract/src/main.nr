use dep::aztec::macros::aztec;

#[aztec]
contract AuthWitTest {
    use dep::aztec::{macros::functions::{private, public}, protocol_types::address::AztecAddress};

    use dep::authwit::auth::{
        assert_inner_hash_valid_authwit, assert_inner_hash_valid_authwit_public,
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
