//! Note traits and utilities
//!
//! ## Siloing

pub mod constants;
pub mod lifecycle;
pub mod note_metadata;
pub mod note_getter;
pub mod note_getter_options;
pub mod note_interface;
pub mod note_viewer_options;
mod hinted_note;
pub use hinted_note::HintedNote;

pub mod utils;

mod note_message;
pub use note_message::{MaybeNoteMessage, NoteMessage};

mod confirmed_note;
pub use confirmed_note::ConfirmedNote;
