//! Echo IPC client — uses GENERATED typed client (EchoApi) over ipc-runtime.
//! Usage: echo_client --socket /tmp/echo.sock
//! Exits 0 on success, 1 on failure.

use echo_wire_compat::generated::echo_client::EchoApi;
use echo_wire_compat::generated::echo_types::EchoInner;
use echo_wire_compat::generated::error::{IpcError, Result};
use ipc_runtime::IpcClient;

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let socket_path = args
        .iter()
        .position(|a| a == "--socket")
        .and_then(|i| args.get(i + 1))
        .expect("Usage: echo_client --socket <path>");

    let backend =
        IpcClient::from_path(socket_path).map_err(|e| IpcError::Backend(e.to_string()))?;
    let mut client = EchoApi::new(backend);

    // Test 1: EchoBytes
    let test_data = vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42];
    let resp = client.bytes(&test_data)?;
    assert_eq!(resp.data, test_data, "EchoBytes data mismatch");
    eprintln!("echo_client(rust): EchoBytes OK");

    // Test 2: EchoFields
    let resp = client.fields(42, 999999, "hello wire compat".to_string())?;
    assert_eq!(resp.a, 42);
    assert_eq!(resp.b, 999999);
    assert_eq!(resp.name, "hello wire compat");
    eprintln!("echo_client(rust): EchoFields OK");

    // Test 3: EchoNested
    let inner = EchoInner {
        values: vec![vec![1, 2, 3], vec![4, 5]],
        flag: Some(true),
    };
    let resp = client.nested(inner.clone())?;
    assert_eq!(resp.inner.values, inner.values);
    assert_eq!(resp.inner.flag, inner.flag);
    eprintln!("echo_client(rust): EchoNested OK");

    // Shutdown
    client.shutdown()?;
    eprintln!("echo_client(rust): all tests passed");
    Ok(())
}
