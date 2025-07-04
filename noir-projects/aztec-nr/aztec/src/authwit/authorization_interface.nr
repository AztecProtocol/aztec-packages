use super::authorization_selector::AuthorizationSelector;

/// Allows getting the selector for an authorization struct (see src/macros/authorization.nr)
/// used to uniquely identify them and avoiding collisions. This is important
/// because authorizations are emitted as offchain effects and their
/// unique selector allows users/wallets to decode them correctly
pub trait AuthorizationInterface {
    /// Returns the unique identifier of the authorization type.
    fn get_authorization_selector(self) -> AuthorizationSelector;
}
