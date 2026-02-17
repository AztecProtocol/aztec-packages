//! FFI backend for Barretenberg
//!
//! This backend calls the Barretenberg C API directly via FFI,
//! eliminating process spawn overhead. Ideal for mobile and embedded use cases.
//!
//! # Requirements
//!
//! This backend requires linking against `libbarretenberg`. You must:
//! 1. Build Barretenberg as a static library (`libbarretenberg.a`)
//! 2. Configure the library search path, either via:
//!    - `.cargo/config.toml`: `[build] rustflags = ["-L", "/path/to/lib"]`
//!    - Environment: `RUSTFLAGS="-L /path/to/lib"`
//!
//! # Example
//!
//! ```ignore
//! use barretenberg_rs::{BarretenbergApi, backends::FfiBackend};
//!
//! let backend = FfiBackend::new()?;
//! let mut api = BarretenbergApi::new(backend);
//!
//! let response = api.blake2s(b"hello world")?;
//! println!("Hash: {:?}", response.hash);
//! ```

use crate::backend::Backend;
use crate::error::{BarretenbergError, Result};
use std::ptr;

// C API exported by Barretenberg
// See: barretenberg/cpp/src/barretenberg/bbapi/c_bind.hpp
// Link directives are in build.rs to control link order (barretenberg depends on env)
extern "C" {
    /// Execute a msgpack-encoded command and return msgpack-encoded response.
    ///
    /// # Safety
    /// - `input_in` must point to valid memory of `input_len_in` bytes
    /// - `output_out` and `output_len_out` must be valid pointers
    /// - Caller must free `*output_out` using `libc::free`
    fn bbapi(
        input_in: *const u8,
        input_len_in: usize,
        output_out: *mut *mut u8,
        output_len_out: *mut usize,
    );
}

/// FFI backend that calls Barretenberg directly via C API.
///
/// This is the most performant backend option as it avoids process spawning
/// and IPC overhead. However, it requires linking against `libbarretenberg`.
///
/// # Thread Safety
///
/// This backend is **not** thread-safe. Each thread should have its own
/// `FfiBackend` instance, or access should be synchronized externally.
pub struct FfiBackend {
    _initialized: bool,
}

impl FfiBackend {
    /// Create a new FFI backend.
    ///
    /// # Errors
    ///
    /// Returns an error if Barretenberg initialization fails.
    pub fn new() -> Result<Self> {
        // Future: Could add SRS initialization here if needed
        // For now, Barretenberg initializes lazily on first use
        Ok(Self { _initialized: true })
    }
}

impl Backend for FfiBackend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        let mut output_ptr: *mut u8 = ptr::null_mut();
        let mut output_len: usize = 0;

        // SAFETY:
        // - input.as_ptr() is valid for input.len() bytes
        // - output_ptr and output_len are valid stack pointers
        // - bbapi allocates output using malloc, which we free below
        unsafe {
            bbapi(
                input.as_ptr(),
                input.len(),
                &mut output_ptr,
                &mut output_len,
            );
        }

        if output_ptr.is_null() {
            return Err(BarretenbergError::Backend(
                "bbapi returned null pointer".to_string(),
            ));
        }

        if output_len == 0 {
            // Free the pointer even if length is 0
            unsafe {
                libc::free(output_ptr as *mut libc::c_void);
            }
            return Err(BarretenbergError::Backend(
                "bbapi returned empty response".to_string(),
            ));
        }

        // SAFETY: output_ptr is valid for output_len bytes, allocated by malloc
        let output = unsafe { std::slice::from_raw_parts(output_ptr, output_len).to_vec() };

        // Free the C-allocated memory
        // SAFETY: output_ptr was allocated by bbapi using malloc
        unsafe {
            libc::free(output_ptr as *mut libc::c_void);
        }

        Ok(output)
    }

    fn destroy(&mut self) -> Result<()> {
        // No cleanup needed - Barretenberg manages its own state
        // Future: Could send Shutdown command here if needed
        self._initialized = false;
        Ok(())
    }
}

impl Drop for FfiBackend {
    fn drop(&mut self) {
        let _ = self.destroy();
    }
}

impl Default for FfiBackend {
    fn default() -> Self {
        Self::new().expect("Failed to initialize FfiBackend")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::BarretenbergApi;

    #[test]
    fn test_ffi_backend_creation() {
        let backend = FfiBackend::new();
        assert!(backend.is_ok());
    }

    #[test]
    fn test_ffi_blake2s() {
        let backend = FfiBackend::new().unwrap();
        let mut api = BarretenbergApi::new(backend);

        let response = api.blake2s(b"hello world").unwrap();
        assert_eq!(response.hash.len(), 32);

        // Verify deterministic output
        let response2 = api.blake2s(b"hello world").unwrap();
        assert_eq!(response.hash, response2.hash);
    }
}
