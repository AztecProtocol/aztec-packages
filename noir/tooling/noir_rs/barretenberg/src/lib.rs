// Suppress the flurry of warnings caused by using "C" naming conventions
#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]

use core::slice;
use std::ffi::{CStr, c_char};

pub mod acir;
pub mod circuit;
pub mod examples;
pub mod pedersen;
pub mod schnorr;
pub mod srs;

// This matches bindgen::Builder output
include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

// TODO create proper logging manager
#[no_mangle]
pub extern "C" fn logstr(ptr: *const ::std::os::raw::c_char) {
    let str = unsafe {parse_c_str(ptr)};
    match str {
        // Some(str) => println!("{}", str),
        // None => println!("Could not parse logstr")
        Some(_) => (),
        None => (),
    }
}

#[derive(Debug, thiserror::Error)]
pub enum BackendError {
    #[error("Binding call error")]
    BindingCallError(String),
    #[error("Binding call output pointer error")]
    BindingCallPointerError(String),
}

pub struct Buffer {
    data: Vec<u8>,
}

impl Buffer {
    /// Constructs a Buffer from a raw pointer, reading a u32 length followed by that many bytes.
    ///
    /// # Safety
    /// This method is unsafe because it trusts the caller to ensure that `ptr` is a valid pointer
    /// pointing to at least `u32` bytes plus the length indicated by the u32 value.
    pub unsafe fn from_ptr(ptr: *const u8) -> Result<Self, BackendError> {
        if ptr.is_null() {
            return Err(BackendError::BindingCallPointerError("Pointer is null.".to_string()));
        }
        let len_slice = slice::from_raw_parts(ptr, 4);
        let len = u32::from_be_bytes([len_slice[0], len_slice[1], len_slice[2], len_slice[3]]);
        let data_ptr = ptr.add(4);
        let data = slice::from_raw_parts(data_ptr, len as usize);
        Ok(Self { data: data.to_vec() })
    }

    /// Returns a reference to the buffer's data as a slice.
    pub fn as_slice(&self) -> &[u8] {
        &self.data
    }

    /// Consumes the Buffer, returning its underlying data as a Vec<u8>.
    pub fn to_vec(self) -> Vec<u8> {
        self.data
    }
}

/// Parses a C string from a raw pointer and returns a Rust String.
///
/// # Safety
/// This function is unsafe because it trusts the caller to provide a valid null-terminated
/// C string. Dereferencing an invalid pointer can cause undefined behavior.
pub unsafe fn parse_c_str(ptr: *const ::std::os::raw::c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    CStr::from_ptr(ptr).to_str().map_or(None, |s| Some(s.to_string()))
}

/// Serializes a slice into a vector of bytes.
///
/// This function takes a byte slice and returns a `Vec<u8>` containing the length of the slice
/// as a 4-byte big-endian integer, followed by the data of the slice itself.
///
/// # Examples
///
/// ```
/// use barretenberg::serialize_slice;
///
/// let data = &[1, 2, 3, 4, 5];
/// let serialized = serialize_slice(data);
/// assert_eq!(serialized, vec![0, 0, 0, 5, 1, 2, 3, 4, 5]);
/// ```
///
/// # Panics
///
/// This function does not panic. However, if used improperly, the deserialization might not
/// recover the original data if the resulting `Vec<u8>` is not interpreted correctly.
///
/// # Returns
///
/// A `Vec<u8>` that contains a 4-byte big-endian representation of the length of the input slice,
/// followed by the data of the slice itself.
pub fn serialize_slice(data: &[u8]) -> Vec<u8> {
    let mut buffer = Vec::new();
    buffer.extend_from_slice(&(data.len() as u32).to_be_bytes());
    buffer.extend_from_slice(data);
    buffer
}