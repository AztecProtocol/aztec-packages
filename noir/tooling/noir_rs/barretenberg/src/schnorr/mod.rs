use super::{parse_c_str, BackendError};
use crate::{
    rust_schnorr_compute_public_key, rust_schnorr_construct_signature,
    rust_schnorr_verify_signature,
};

/// Computes the public key for a given byte sequence.
/// # Arguments
/// * `bytes` - Byte sequence from which to compute the public key.
/// # Returns
/// * `Result<[u8; 64], BackendError>` - Returns the computed public key or an error.
pub fn compute_public_key(bytes: &[u8]) -> Result<[u8; 64], BackendError> {
    let mut result = [0u8; 64];
    let error_msg_ptr = unsafe {
        rust_schnorr_compute_public_key(bytes.as_ptr(), result.as_mut_slice().as_mut_ptr())
    };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    Ok(result)
}

/// Constructs a Schnorr signature from a message and private key.
/// # Safety
/// This function is marked `unsafe` because it interfaces with low-level C/C++ bindings.
/// Ensure that `message` is a valid C string ending with a null character.
/// # Arguments
/// * `message` - The message for which to create the signature. Must be a C string ending in a null character.
/// * `private_key` - The private key to be used for signature generation.
/// # Returns
/// * `Result<([u8; 32], [u8; 32]), BackendError>` - Returns the signature (s, e) or an error.
pub unsafe fn construct_signature(
    message: &[u8],
    private_key: &[u8; 32],
) -> Result<([u8; 32], [u8; 32]), BackendError> {
    let mut s = [0u8; 32];
    let mut e = [0u8; 32];
    let error_msg_ptr = unsafe {
        rust_schnorr_construct_signature(
            message.as_ptr(),
            private_key.as_slice().as_ptr(),
            s.as_mut_slice().as_mut_ptr(),
            e.as_mut_slice().as_mut_ptr(),
        )
    };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    Ok((s, e))
}

/// Verifies a Schnorr signature for a given message, public key, and signature values.
/// # Safety
/// This function is marked `unsafe` because it interfaces with low-level C/C++ bindings.
/// Ensure that `message` is a valid C string ending with a null character.
/// # Arguments
/// * `message` - The message for which to verify the signature. Must be a C string ending in a null character.
/// * `pub_key` - The public key associated with the signature.
/// * `sig_s` - The `s` component of the signature.
/// * `sig_e` - The `e` component of the signature.
/// # Returns
/// * `Result<bool, BackendError>` - Returns `true` if the signature is valid, otherwise `false` or an error.
pub unsafe fn verify_signature(
    message: &[u8],
    pub_key: [u8; 64],
    sig_s: [u8; 32],
    sig_e: [u8; 32],
) -> Result<bool, BackendError> {
    let mut result = false;
    let error_msg_ptr = unsafe {
        rust_schnorr_verify_signature(
            message.as_ptr(),
            pub_key.as_slice().as_ptr(),
            sig_s.as_slice().as_ptr(),
            sig_e.as_slice().as_ptr(),
            &mut result,
        )
    };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    Ok(result)
}
