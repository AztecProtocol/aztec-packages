//! Mock types for tests.
//!
//! These are simple representations of complex types (like notes and events) that would typically require a full
//! contract in order to be defined.

pub mod mock_event;
pub mod mock_note;
mod mock_struct;
pub use mock_struct::MockStruct;
