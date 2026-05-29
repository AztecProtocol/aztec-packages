//! Authorization.

pub mod account;
pub mod authorization_interface;
mod authorization_selector;
pub use authorization_selector::AuthorizationSelector;
pub mod utils;
pub mod private;
pub mod public;
pub mod entrypoint;
