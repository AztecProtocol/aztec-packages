//! Definition of Aztec contract functions, storage, notes and events.

mod aztec;
pub use aztec::{aztec, AztecConfig};

pub mod dispatch;
pub(crate) mod calls_generation;
pub mod internals_functions_generation;
pub mod functions;
pub mod utils;
pub mod notes;
pub mod storage;
pub mod events;
pub mod authorization;
