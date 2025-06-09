use aztec::macros::aztec;

#[aztec]
pub contract PublicFunctionSelectorCollision {
    use aztec::macros::functions::public;

    #[public]
    fn fn_selector_collision() {}

    #[public]
    fn fn_selector_collision_1442740381() {}
}
