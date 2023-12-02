use crate::{
    rust_acir_get_circuit_sizes, {parse_c_str, serialize_slice, BackendError},
};

/// Represents the sizes of various components within a circuit.
///
/// This struct captures sizes that are relevant to the construction or evaluation of a circuit,
/// such as the exact size of the circuit, its total size, and the size of its subgroup.
#[derive(Default, Debug)]
pub struct CircuitSizes {
    pub exact: u32,
    pub total: u32,
    pub subgroup: u32,
}

/// Fetches the sizes for various components of a given circuit.
///
/// This function takes a buffer representing a constraint system and returns the sizes of
/// various components within the circuit. The sizes are retrieved using the provided
/// `acir_get_circuit_sizes` FFI function. If there's an error during the FFI call, it
/// will print the error message.
///
/// # Arguments
///
/// * `constraint_system_buf` - A byte slice that represents the constraint system for which
///   the sizes are to be retrieved.
///
/// # Returns
///
/// Returns a `CircuitSizes` struct containing the sizes for the exact, total, and subgroup
/// components of the circuit.
///
/// # Panics
///
/// This function might panic if the underlying FFI call encounters a critical error.
pub fn get_circuit_sizes(constraint_system_buf: &[u8]) -> Result<CircuitSizes, BackendError> {
    let mut ret = CircuitSizes::default();
    let error_msg_ptr = unsafe {
        rust_acir_get_circuit_sizes(
            serialize_slice(constraint_system_buf).as_slice().as_ptr(),
            &mut ret.exact,
            &mut ret.total,
            &mut ret.subgroup,
        )
    };
    if !error_msg_ptr.is_null() {
        return Err(BackendError::BindingCallError(format!(
            "C++ error: {}",
            unsafe { parse_c_str(error_msg_ptr) }.unwrap_or("Parsing c_str failed".to_string())
        )));
    }
    Ok(ret)
}
