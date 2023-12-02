use std::{ffi::c_void, ptr};

use crate::{
    parse_c_str, rust_acir_create_proof, rust_acir_delete_acir_composer,
    rust_acir_get_solidity_verifier, rust_acir_get_verification_key, rust_acir_init_proving_key,
    rust_acir_init_verification_key, rust_acir_load_verification_key, rust_acir_new_acir_composer,
    rust_acir_serialize_proof_into_fields, rust_acir_serialize_verification_key_into_fields,
    rust_acir_verify_proof,
};

use super::{serialize_slice, BackendError, Buffer};

// Wrapper functions to interface with C++ ACIR operations.

pub type AcirComposerPtr = *mut c_void;

/// Creates a new ACIR composer.
/// # Arguments
/// * `size_hint` - Hint for the size of the composer.
/// # Returns
/// * `Result<AcirComposerPtr, String>` - Returns a pointer to the ACIR composer or an error message.
pub fn new_acir_composer(size_hint: &u32) -> Result<AcirComposerPtr, BackendError> {
    let mut out_ptr = ptr::null_mut();
    let error_msg_ptr = unsafe { rust_acir_new_acir_composer(size_hint, &mut out_ptr) };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    if out_ptr.is_null() {
        return Err(BackendError::BindingCallPointerError(
            "Failed to create a new ACIR composer.".to_string(),
        ));
    }
    Ok(out_ptr)
}

/// Initializes the proving key for the given composer.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer.
/// * `constraint_system_buf` - Buffer representing the constraint system.
/// # Returns
/// * `Result<(), String>` - Returns an empty result or an error message.
pub fn init_proving_key(
    acir_composer: &AcirComposerPtr,
    constraint_system_buf: &[u8],
) -> Result<(), BackendError> {
    let error_msg_ptr = unsafe {
        rust_acir_init_proving_key(
            acir_composer,
            serialize_slice(constraint_system_buf).as_slice().as_ptr(),
        )
    };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    Ok(())
}

/// Creates a proof using the provided constraint system buffer and witness.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer.
/// * `constraint_system_buf` - Buffer representing the constraint system.
/// * `witness` - Buffer representing the witness.
/// * `is_recursive` - Boolean indicating whether the proof is recursive.
/// # Returns
/// * `Result<Vec<u8>, String>` - Returns the created proof or an error message.
pub fn create_proof(
    acir_composer: &AcirComposerPtr,
    constraint_system_buf: &[u8],
    witness: &[u8],
    is_recursive: bool,
) -> Result<Vec<u8>, BackendError> {
    let mut out_ptr = ptr::null_mut();
    let error_msg_ptr = unsafe {
        rust_acir_create_proof(
            acir_composer,
            serialize_slice(constraint_system_buf).as_slice().as_ptr(),
            serialize_slice(witness).as_slice().as_ptr(),
            &is_recursive,
            &mut out_ptr,
        )
    };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    let result = unsafe {
        Buffer::from_ptr(Buffer::from_ptr(out_ptr)?.to_vec().as_slice().as_ptr())?.to_vec()
    };
    Ok(result)
}

/// Loads the verification key into the given composer.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer.
/// * `verification_key` - Buffer representing the verification key.
/// # Returns
/// * `Result<(), String>` - Returns an empty result or an error message.
pub fn load_verification_key(
    acir_composer: &AcirComposerPtr,
    verification_key: &[u8],
) -> Result<(), BackendError> {
    let error_msg_ptr =
        unsafe { rust_acir_load_verification_key(acir_composer, verification_key.as_ptr()) };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    Ok(())
}

/// Initializes the ACIR composer's verification key.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer.
/// # Returns
/// * `Result<(), String>` - Returns an empty result or an error message if there's an issue with the initialization.
pub fn init_verification_key(acir_composer: &AcirComposerPtr) -> Result<(), BackendError> {
    let error_msg_ptr = unsafe { rust_acir_init_verification_key(acir_composer) };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    Ok(())
}

/// Retrieves the verification key from the ACIR composer.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer.
/// # Returns
/// * `Result<Vec<u8>, String>` - Returns the verification key or an error message.
pub fn get_verification_key(acir_composer: &AcirComposerPtr) -> Result<Vec<u8>, BackendError> {
    let mut out_ptr = ptr::null_mut();
    let error_msg_ptr = unsafe { rust_acir_get_verification_key(acir_composer, &mut out_ptr) };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    let result = unsafe { Buffer::from_ptr(out_ptr)?.to_vec() };
    Ok(result)
}

/// Verifies the proof with the ACIR composer.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer.
/// * `proof` - Buffer representing the proof.
/// * `is_recursive` - Boolean indicating whether the proof is recursive.
/// # Returns
/// * `Result<bool, String>` - Returns `true` if the verification succeeds, `false` otherwise, or an error message.
pub fn verify_proof(
    acir_composer: &AcirComposerPtr,
    proof: &[u8],
    is_recursive: bool,
) -> Result<bool, BackendError> {
    let mut result = false;
    let error_msg_ptr = unsafe {
        rust_acir_verify_proof(
            acir_composer,
            serialize_slice(proof).as_slice().as_ptr(),
            &is_recursive,
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

/// Gets the Solidity verifier string representation from the ACIR composer.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer.
/// # Returns
/// * `Result<String, String>` - Returns the Solidity verifier string or an error message.
pub fn get_solidity_verifier(acir_composer: &AcirComposerPtr) -> Result<String, BackendError> {
    let mut out_ptr: *mut u8 = ptr::null_mut();
    let error_msg_ptr = unsafe { rust_acir_get_solidity_verifier(acir_composer, &mut out_ptr) };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    let verifier_string =
        unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string());
    Ok(verifier_string)
}

/// Serializes the provided proof into fields.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer.
/// * `proof` - Buffer representing the proof.
/// * `num_inner_public_inputs` - Number of inner public inputs.
/// # Returns
/// * `Result<Vec<u8>, String>` - Returns the serialized proof or an error message.
pub fn serialize_proof_into_fields(
    acir_composer: &AcirComposerPtr,
    proof: &[u8],
    num_inner_public_inputs: u32,
) -> Result<Vec<u8>, BackendError> {
    let mut out_ptr: *mut u8 = ptr::null_mut();
    let error_msg_ptr = unsafe {
        rust_acir_serialize_proof_into_fields(
            acir_composer,
            serialize_slice(proof).as_slice().as_ptr(),
            &num_inner_public_inputs,
            &mut out_ptr,
        )
    };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    let result = unsafe { Buffer::from_ptr(out_ptr)?.to_vec() };
    Ok(result)
}

/// Serializes the verification key into field elements.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer.
/// # Returns
/// * `Result<(Vec<u8>, Vec<u8>), String>` - Returns serialized verification key and its hash, or an error message.
pub fn serialize_verification_key_into_fields(
    acir_composer: &AcirComposerPtr,
) -> Result<(Vec<u8>, Vec<u8>), BackendError> {
    let mut out_vkey_ptr: *mut u8 = ptr::null_mut();
    let out_key_hash_ptr: *mut u8 = ptr::null_mut();
    let error_msg_ptr = unsafe {
        rust_acir_serialize_verification_key_into_fields(
            acir_composer,
            &mut out_vkey_ptr,
            out_key_hash_ptr,
        )
    };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    let vkey = unsafe { Buffer::from_ptr(out_vkey_ptr)?.to_vec() };
    let key_hash = unsafe { Buffer::from_ptr(out_key_hash_ptr)?.to_vec() };
    Ok((vkey, key_hash))
}

/// Frees the internal memory used by the ACIR composer.
/// # Arguments
/// * `acir_composer` - Pointer to the ACIR composer to be freed.
/// # Returns
/// * `Result<(), String>` - Returns an empty result or an error message if there's an issue during deletion.
pub fn delete(acir_composer: AcirComposerPtr) -> Result<(), String> {
    let error_msg_ptr = unsafe { rust_acir_delete_acir_composer(&acir_composer) };
    if !error_msg_ptr.is_null() {
        return Err(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        ));
    }
    Ok(())
}
