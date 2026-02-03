//! Event traits and utilities.

pub mod event_emission;
pub mod event_interface;

mod event_message;
pub use event_message::EventMessage;

mod event_selector;
pub use event_selector::EventSelector;
