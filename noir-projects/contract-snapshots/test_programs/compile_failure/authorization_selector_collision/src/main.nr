/// Targets the panic at `aztec-nr/aztec/src/macros/authorization.nr:15`: selector
/// collision between two `#[authorization]` structs.
///
/// Note on the noisy cascade in `expected_error`: the `#[authorization]` macro is
/// currently `pub` in aztec-nr but only ever consumed from within aztec-nr itself (in
/// `authwit/auth.nr`). Its generated code references `crate::authwit::*` paths which
/// do not resolve from a downstream crate, producing a handful of cascading resolution
/// errors before the collision panic is reached.
///
/// The snapshot captures this behavior exactly. If `#[authorization]` is made
/// crate-private (or the macro is rewritten to reference aztec-nr paths absolutely),
/// this test will need regeneration and the cascade lines will disappear.
///
/// Tracking issue:
/// https://linear.app/aztec-labs/issue/F-580/authorization-macro-is-pub-but-has-no-downstream-consumers-and-leaks
use aztec::macros::aztec;

#[aztec]
pub contract AuthorizationSelectorCollision {
    use aztec::macros::authorization::authorization;

    // Event and Authorization selectors are derived from the same signature hash, so the
    // pair of names known to collide as events also collides as authorizations.
    #[authorization]
    struct EventCollision {}

    #[authorization]
    struct EventCollision8370082250 {}
}
