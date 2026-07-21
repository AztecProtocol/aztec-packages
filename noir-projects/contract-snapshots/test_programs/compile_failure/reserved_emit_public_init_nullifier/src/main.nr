/// Public functions cannot use the reserved name __emit_public_init_nullifier.
///
use aztec::macros::aztec;

#[aztec]
contract ReservedEmitPublicInitNullifier {
    use aztec::macros::functions::external;

    #[external("public")]
    fn __emit_public_init_nullifier() {}
}
