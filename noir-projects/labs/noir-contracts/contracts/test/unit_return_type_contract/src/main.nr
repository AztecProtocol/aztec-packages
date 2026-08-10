// Verifies that contract functions with a unit return type `()` compile without requiring Serialize or Deserialize.
use aztec::macros::aztec;

#[aztec]
pub contract UnitReturnType {
    use aztec::macros::functions::external;

    #[external("private")]
    fn private_unit_return(_x: Field) {}

    #[external("public")]
    fn public_unit_return(_x: Field) {}

    #[external("utility")]
    unconstrained fn utility_unit_return(_x: Field) {}
}
