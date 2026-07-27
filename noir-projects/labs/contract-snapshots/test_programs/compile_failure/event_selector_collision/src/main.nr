use aztec::macros::aztec;

#[aztec]
pub contract EventSelectorCollision {
    use aztec::macros::events::event;

    #[event]
    struct EventCollision {}

    #[event]
    struct EventCollision8370082250 {}
}
