//! A service the host reaches for a wasm module or a native library, as a backend for any
//! generated `<Service>Api`.
//!
//! A wasm module has no sockets, so a service it calls is one its host provides: the module
//! imports `ipc_runtime.host_call` and names the service by a target string the host binds when
//! it instantiates the module (ipc-runtime's `hostCall` option: another module on the same worker,
//! or a function of the host's own, which may answer asynchronously). The call blocks, or is
//! suspended by the host, until the host answers.
//!
//! The import's contract, shared with the C++ `ipc_codegen::HostCallBackend`:
//!
//! ```text
//! int32_t host_call(const uint8_t* target, size_t target_len,
//!                   const uint8_t* request, size_t request_len,
//!                   uint8_t** response, size_t* response_len)
//! ```
//!
//! The host leaves the response in a buffer from the module's own `<service>_ipc_ffi_alloc`
//! (malloc-compatible), which the caller frees. 0 means the bytes are the service's response (an
//! error response included); anything else means the call never reached the service, and the
//! bytes are the host's message saying why.
//!
//! Outside wasm, a library's host passes the same function to the library's
//! `<service>_ipc_ffi_set_host_call` export (ipc-runtime's Node-API and JSI bindings do), which
//! stores it with [`set_native_host_call`]; until then every call fails. On wasm32 this needs the
//! `libc` crate, as the generated FFI exports does.

use crate::backend::Backend;
use crate::error::{IpcError, Result};
#[cfg(not(target_arch = "wasm32"))]
use std::sync::atomic::{AtomicUsize, Ordering};

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "ipc_runtime")]
unsafe extern "C" {
    #[link_name = "host_call"]
    fn ipc_runtime_host_call(
        target: *const u8,
        target_len: usize,
        request: *const u8,
        request_len: usize,
        response: *mut *mut u8,
        response_len: *mut usize,
    ) -> i32;
}

/// The host-call function a native host provides; see the module docs for its contract.
pub type NativeHostCall = unsafe extern "C" fn(
    target: *const u8,
    target_len: usize,
    request: *const u8,
    request_len: usize,
    response: *mut *mut u8,
    response_len: *mut usize,
) -> i32;

#[cfg(not(target_arch = "wasm32"))]
static NATIVE_HOST_CALL: AtomicUsize = AtomicUsize::new(0);

/// Stores the host's host-call function for every [`HostCallBackend`] of this library; `None`
/// clears it.
pub fn set_native_host_call(host_call: Option<NativeHostCall>) {
    #[cfg(not(target_arch = "wasm32"))]
    NATIVE_HOST_CALL.store(host_call.map_or(0, |f| f as usize), Ordering::Release);
    #[cfg(target_arch = "wasm32")]
    let _ = host_call;
}

#[cfg(not(target_arch = "wasm32"))]
unsafe extern "C" {
    // The response buffer comes from the library's `<service>_ipc_ffi_alloc`, which is malloc.
    fn free(ptr: *mut std::ffi::c_void);
}

/// A backend over the `ipc_runtime.host_call` import, reaching whatever the host binds to `target`.
pub struct HostCallBackend {
    target: String,
}

impl HostCallBackend {
    /// `target` is the name the host binds this service to (a `hostCall` key).
    pub fn new(target: impl Into<String>) -> Self {
        Self {
            target: target.into(),
        }
    }
}

impl Backend for HostCallBackend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        let mut response: *mut u8 = std::ptr::null_mut();
        let mut response_len: usize = 0;
        // SAFETY: the host reads the target and request within their lengths, and writes a buffer
        // from this library's allocator and its length to the two out-pointers.
        let status = unsafe {
            #[cfg(target_arch = "wasm32")]
            let host_call: NativeHostCall = ipc_runtime_host_call;
            #[cfg(not(target_arch = "wasm32"))]
            let host_call: NativeHostCall = match NATIVE_HOST_CALL.load(Ordering::Acquire) {
                0 => {
                    return Err(IpcError::Backend(format!(
                        "host_call {}: no host has bound host calls for this library",
                        self.target
                    )))
                }
                // SAFETY: only set_native_host_call stores here, from a NativeHostCall.
                f => std::mem::transmute::<usize, NativeHostCall>(f),
            };
            host_call(
                self.target.as_ptr(),
                self.target.len(),
                input.as_ptr(),
                input.len(),
                &mut response,
                &mut response_len,
            )
        };
        let bytes = if response.is_null() {
            Vec::new()
        } else {
            // SAFETY: the host wrote `response_len` bytes at `response`, a malloc-compatible
            // buffer this library now owns.
            unsafe {
                let bytes = std::slice::from_raw_parts(response, response_len).to_vec();
                #[cfg(target_arch = "wasm32")]
                libc::free(response as *mut libc::c_void);
                #[cfg(not(target_arch = "wasm32"))]
                free(response as *mut std::ffi::c_void);
                bytes
            }
        };
        if status != 0 {
            return Err(IpcError::Backend(format!(
                "host_call {}: {}",
                self.target,
                String::from_utf8_lossy(&bytes)
            )));
        }
        Ok(bytes)
    }

    fn destroy(&mut self) -> Result<()> {
        Ok(())
    }
}
