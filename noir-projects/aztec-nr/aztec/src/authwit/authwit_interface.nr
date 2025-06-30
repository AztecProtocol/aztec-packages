use super::authwit_selector::AuthwitSelector;

pub trait AuthwitInterface {
    /// Returns the unique identifier of the authwit.
    fn get_authwit_selector() -> AuthwitSelector;

    /// Emits the authwit as an offchain effect and returns its inner hash.
    fn emit_as_offchain_effect_and_get_hash(self) -> Field;
}
