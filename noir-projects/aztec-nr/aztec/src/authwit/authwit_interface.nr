use super::authwit_selector::AuthwitSelector;

pub trait AuthwitInterface {
    /// Returns the unique identifier of the authwit.
    fn get_authwit_selector(self) -> AuthwitSelector;
}
