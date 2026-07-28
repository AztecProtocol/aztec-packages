//! Authorization.

pub mod account;
pub mod authorization_interface;
mod authorization_selector;
pub use authorization_selector::AuthorizationSelector;
pub mod auth;
pub mod entrypoint;
