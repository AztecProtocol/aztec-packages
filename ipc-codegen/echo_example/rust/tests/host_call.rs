//! Outside wasm there is no host for `ipc_runtime.host_call`: a client over a `HostCallBackend`
//! still builds and links natively, and every call fails saying why.

use echo_wire_compat::generated::echo_client::EchoApi;
use echo_wire_compat::generated::host_call_backend::HostCallBackend;

#[test]
fn host_call_outside_wasm_fails_the_call() {
    let mut api = EchoApi::new(HostCallBackend::new("echo"));
    let err = api.bytes(&[1, 2, 3]).expect_err("no host outside wasm");
    let message = err.to_string();
    assert!(message.contains("host_call echo"), "{message}");
    assert!(message.contains("no host here"), "{message}");
}
