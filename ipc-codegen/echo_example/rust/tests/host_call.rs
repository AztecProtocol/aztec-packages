//! A client over a `HostCallBackend` in a native library: until its host binds a host-call
//! function every call fails saying why, and once bound the calls reach whatever the host routes
//! them to (here, an instance of the echo service's own FFI exports).

use echo_wire_compat::generated::echo_client::EchoApi;
use ipc_runtime::host_call_backend::{set_native_host_call, HostCallBackend};

#[test]
fn host_calls_fail_until_a_host_binds_them() {
    set_native_host_call(None);
    let mut api = EchoApi::new(HostCallBackend::new("echo"));
    let err = api.bytes(&[1, 2, 3]).expect_err("no host bound");
    let message = err.to_string();
    assert!(message.contains("host_call echo"), "{message}");
    assert!(message.contains("no host has bound"), "{message}");

    #[cfg(feature = "ffi")]
    bound::reaches_the_target();
}

#[cfg(feature = "ffi")]
mod bound {
    use super::*;
    use std::ffi::c_void;

    extern "C" {
        fn echo_ipc_ffi_create() -> *mut c_void;
        fn echo_ipc_ffi_call(
            instance: *mut c_void,
            input: *const u8,
            input_len: usize,
            output: *mut *mut u8,
            output_len: *mut usize,
        );
        fn echo_ipc_ffi_destroy(instance: *mut c_void);
        fn echo_ipc_ffi_set_host_call(
            host_call: Option<
                unsafe extern "C" fn(
                    *const u8,
                    usize,
                    *const u8,
                    usize,
                    *mut *mut u8,
                    *mut usize,
                ) -> i32,
            >,
        );
    }

    /// Routes target "echo" to a fresh echo instance, and refuses anything else.
    unsafe extern "C" fn host_call(
        target: *const u8,
        target_len: usize,
        request: *const u8,
        request_len: usize,
        response: *mut *mut u8,
        response_len: *mut usize,
    ) -> i32 {
        let target = unsafe { std::slice::from_raw_parts(target, target_len) };
        if target != b"echo" {
            let message = b"unknown target";
            let buf = unsafe { libc::malloc(message.len()) } as *mut u8;
            unsafe {
                std::ptr::copy_nonoverlapping(message.as_ptr(), buf, message.len());
                *response = buf;
                *response_len = message.len();
            }
            return 1;
        }
        unsafe {
            let instance = echo_ipc_ffi_create();
            echo_ipc_ffi_call(instance, request, request_len, response, response_len);
            echo_ipc_ffi_destroy(instance);
        }
        0
    }

    pub fn reaches_the_target() {
        unsafe { echo_ipc_ffi_set_host_call(Some(host_call)) };
        let mut api = EchoApi::new(HostCallBackend::new("echo"));
        assert_eq!(api.bytes(&[1, 2, 3]).expect("bound").data, vec![1, 2, 3]);

        let mut other = EchoApi::new(HostCallBackend::new("other"));
        let message = other.bytes(&[1]).expect_err("unknown target").to_string();
        assert!(
            message.contains("host_call other: unknown target"),
            "{message}"
        );
        set_native_host_call(None);
    }
}
