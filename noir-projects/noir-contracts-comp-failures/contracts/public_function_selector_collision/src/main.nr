use aztec::macros::aztec;

/// This contract is used to test that the compile-time public function selector collision detection works.
#[aztec]
pub contract PublicFunctionSelectorCollision {
    use aztec::macros::functions::public;

    #[public]
    fn fn_selector_collision() {}

    #[public]
    fn fn_selector_collision_1442740381() {}
}
