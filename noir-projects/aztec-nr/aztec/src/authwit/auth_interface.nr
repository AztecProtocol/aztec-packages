use super::auth_selector::AuthorizationSelector;

pub trait AuthorizationInterface {
    /// Returns the unique identifier of the authorization type.
    fn get_authorization_selector(self) -> AuthorizationSelector;
}
