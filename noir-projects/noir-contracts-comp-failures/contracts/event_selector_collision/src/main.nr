use aztec::macros::aztec;

#[aztec]
pub contract EventSelectorCollision {
    use aztec::macros::events::event;

    // TODO: replace this with nice event signatures once Zorzal shares his script
    #[event]
    struct fn_selector_collision {}

    #[event]
    struct fn_selector_collision_1442740381 {}
}
