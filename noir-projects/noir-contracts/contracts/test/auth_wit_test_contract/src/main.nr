use aztec::macros::aztec;

#[aztec]
pub contract AuthWitTest {
    use aztec::{
        authwit::auth::{assert_inner_hash_valid_authwit, assert_inner_hash_valid_authwit_public},
        macros::functions::{authorize_once, external},
        protocol::{address::AztecAddress, traits::{Deserialize, Serialize}},
    };

    /// A struct that serializes to 3 fields. Used to test that #[authorize_once] computes the
    /// serialized args length (sum of Serialize::N) rather than the parameter count.
    #[derive(Serialize, Deserialize)]
    pub struct MultiFieldStruct {
        pub a: Field,
        pub b: Field,
        pub c: Field,
    }

    #[external("private")]
    fn consume(on_behalf_of: AztecAddress, inner_hash: Field) {
        assert_inner_hash_valid_authwit(self.context, on_behalf_of, inner_hash);
    }

    #[external("public")]
    fn consume_public(on_behalf_of: AztecAddress, inner_hash: Field) {
        assert_inner_hash_valid_authwit_public(self.context, on_behalf_of, inner_hash);
    }

    /// Test function: #[authorize_once] with a struct parameter that serializes to 3 fields.
    /// The macro must emit assert_current_call_valid_authwit::<6>
    /// (from:1 + data:3 + amount:1 + nonce:1), not ::<4> (parameter count).
    #[authorize_once("from", "authwit_nonce")]
    #[external("private")]
    fn auth_with_struct(
        from: AztecAddress,
        data: MultiFieldStruct,
        amount: Field,
        authwit_nonce: Field,
    ) {
        // No-op: exists only to validate the macro-generated turbofish parameter.
        let _ = data;
        let _ = amount;
    }
}
