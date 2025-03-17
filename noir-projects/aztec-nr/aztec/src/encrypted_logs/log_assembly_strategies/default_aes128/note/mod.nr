pub mod encryption;
pub mod note;

pub use note::{
    compute_log, compute_log_unconstrained, encode_and_encrypt_note,
    encode_and_encrypt_note_unconstrained,
};
