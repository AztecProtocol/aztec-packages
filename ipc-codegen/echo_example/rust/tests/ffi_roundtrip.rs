//! In-process round trip: the generated FFI client backend calling this crate's
//! own generated FFI entry (`export_echo_ffi!` in lib.rs), no process involved.
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
