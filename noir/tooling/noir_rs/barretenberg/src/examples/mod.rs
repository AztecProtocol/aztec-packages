use crate::{parse_c_str, rust_examples_simple_create_and_verify_proof};

use super::BackendError;

/// A Rust function that interfaces with C++ bindings to create and verify a proof.
///
/// This function leverages a C++ implementation, `rust_examples_simple_create_and_verify_proof`,
/// to create and verify a proof. If the C++ function encounters any issues and returns an error message,
/// this function captures that error message and returns it as a `BackendError`.
///
/// # Returns
///
/// Returns a boolean indicating if the creation and verification of the proof was successful.
/// If there was an issue interfacing with the C++ bindings or an error in the C++ function,
pub fn simple_create_and_verify_proof() -> Result<bool, BackendError> {
    let mut result = false;
    let error_msg_ptr = unsafe { rust_examples_simple_create_and_verify_proof(&mut result) };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    Ok(result)
}
