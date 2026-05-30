//! FFI backend scaffold for direct library linking.
//!
//! Calls a C symbol with msgpack bytes — no IPC overhead. Link against a
//! native library that exports `ipc_ffi_entry`, and add the appropriate
//! `-L` / `-l` directives to your `build.rs`.
//!
//! # Requirements
//!
//! 1. A native library exporting an extern-C function with this signature:
//!    ```text
//!    void ipc_ffi_entry(
//!        const uint8_t* input, size_t input_len,
//!        uint8_t** output_out, size_t* output_len_out);
//!    ```
//!    `*output_out` must be a `malloc`'d buffer the caller is responsible for freeing.
//! 2. Library search path configured (via `.cargo/config.toml`, `RUSTFLAGS`, or
//!    `cargo:rustc-link-search` in `build.rs`).
//!
//! # Example
//!
//! ```ignore
//! use my_service_client::{ServiceApi, FfiBackend};
//!
//! let backend = FfiBackend::new()?;
//! let mut api = ServiceApi::new(backend);
//! let response = api.some_command(args)?;
//! ```

use super::backend::Backend;
use super::error::{IpcError, Result};
use std::ptr;

extern "C" {
    /// Execute a msgpack-encoded command and return msgpack-encoded response.
    ///
    /// # Safety
    /// - `input_in` must point to valid memory of `input_len_in` bytes
    /// - `output_out` and `output_len_out` must be valid pointers
    /// - Caller must free `*output_out` using `libc::free`
    fn ipc_ffi_entry(
        input_in: *const u8,
        input_len_in: usize,
        output_out: *mut *mut u8,
        output_len_out: *mut usize,
    );
}

/// FFI backend that calls a native library directly via its C ABI.
///
/// Most performant backend (no process spawn, no IPC overhead) but requires
/// linking against the native library at build time.
///
/// # Thread Safety
///
/// This backend is **not** thread-safe by default. Each thread should have
/// its own `FfiBackend` instance, or access should be synchronized externally.
pub struct FfiBackend {
    _initialized: bool,
}

impl FfiBackend {
    /// Create a new FFI backend.
    pub fn new() -> Result<Self> {
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
        // - the FFI entrypoint allocates output using malloc, which we free below
        unsafe {
            ipc_ffi_entry(
                input.as_ptr(),
                input.len(),
                &mut output_ptr,
                &mut output_len,
            );
        }

        if output_ptr.is_null() {
            return Err(IpcError::Backend(
                "FFI entry returned null pointer".to_string(),
            ));
        }

        if output_len == 0 {
            unsafe {
                libc::free(output_ptr as *mut libc::c_void);
            }
            return Err(IpcError::Backend(
                "FFI entry returned empty response".to_string(),
            ));
        }

        // SAFETY: output_ptr is valid for output_len bytes, allocated by malloc
        let output = unsafe { std::slice::from_raw_parts(output_ptr, output_len).to_vec() };

        // SAFETY: output_ptr was allocated by the FFI entrypoint using malloc
        unsafe {
            libc::free(output_ptr as *mut libc::c_void);
        }

        Ok(output)
    }

    fn destroy(&mut self) -> Result<()> {
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
