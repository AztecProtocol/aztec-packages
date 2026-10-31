//! In-process round trip: the generated FFI client backend calling this crate's
//! own generated FFI entry (`export_echo_ffi!` in lib.rs), no process involved,
//! and instances of it called on several threads at once.
#![cfg(feature = "ffi")]

use echo_wire_compat::generated::echo_client::EchoApi;
use echo_wire_compat::generated::ffi_backend::FfiBackend;

#[test]
fn ffi_roundtrip() {
    let mut api = EchoApi::new(FfiBackend::new().expect("FfiBackend"));

    let data = vec![0xde, 0xad, 0xbe, 0xef, 0x42];
    let resp = api.bytes(&data).expect("EchoBytes");
    assert_eq!(resp.data, data);

    let resp = api
        .fields(42, 999_999, "hello ffi".to_string())
        .expect("EchoFields");
    assert_eq!(
        (resp.a, resp.b, resp.name.as_str()),
        (42, 999_999, "hello ffi")
    );

    assert!(
        api.fail("boom".to_string()).is_err(),
        "EchoFail must surface as an error"
    );
}

extern "C" {
    fn echo_ipc_ffi_create() -> *mut std::ffi::c_void;
    fn echo_ipc_ffi_call(
        instance: *mut std::ffi::c_void,
        input: *const u8,
        input_len: usize,
        output: *mut *mut u8,
        output_len: *mut usize,
    );
    fn echo_ipc_ffi_destroy(instance: *mut std::ffi::c_void);
    fn echo_ipc_ffi_free(ptr: *mut u8);
}

/// A backend over one instance of the crate's own FFI entry (echo_ipc_ffi_create).
struct InstanceBackend(*mut std::ffi::c_void);

impl echo_wire_compat::backend::Backend for InstanceBackend {
    fn call(&mut self, input: &[u8]) -> echo_wire_compat::error::Result<Vec<u8>> {
        let mut output: *mut u8 = std::ptr::null_mut();
        let mut output_len = 0;
        // SAFETY: the instance is live, and only this backend calls it.
        unsafe {
            echo_ipc_ffi_call(
                self.0,
                input.as_ptr(),
                input.len(),
                &mut output,
                &mut output_len,
            );
            let response = std::slice::from_raw_parts(output, output_len).to_vec();
            echo_ipc_ffi_free(output);
            Ok(response)
        }
    }

    fn destroy(&mut self) -> echo_wire_compat::error::Result<()> {
        Ok(())
    }
}

#[test]
fn ffi_instances_run_concurrently() {
    let threads: Vec<_> = (0..4u32)
        .map(|i| {
            std::thread::spawn(move || {
                // SAFETY: a fresh instance, destroyed below once its backend is done with it.
                let instance = unsafe { echo_ipc_ffi_create() };
                assert!(!instance.is_null());
                let mut api = EchoApi::new(InstanceBackend(instance));
                for j in 0..50u32 {
                    let data = vec![i as u8, j as u8];
                    assert_eq!(api.bytes(&data).expect("EchoBytes").data, data);
                }
                assert!(api.fail("boom".to_string()).is_err());
                drop(api);
                // SAFETY: no call on it is running.
                unsafe { echo_ipc_ffi_destroy(instance) };
            })
        })
        .collect();
    for thread in threads {
        thread.join().expect("instance thread");
    }
}
