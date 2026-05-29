//! Echo IPC client — uses GENERATED typed client (EchoApi) over ipc-runtime.
//! Usage: echo_client --socket /tmp/echo.sock
//! Exits 0 on success, 1 on failure.

use echo_wire_compat::generated::echo_client::EchoApi;
use echo_wire_compat::generated::echo_types::{EchoInner, Fr};
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

    // Test 4: EchoAliases
    let hash = Fr::from_bytes(std::array::from_fn(|i| 0x10 + i as u8));
    let second = Fr::from_bytes(std::array::from_fn(|i| 0x40 + i as u8));
    let resp = client.aliases(
        7,
        hash.clone(),
        Some(second.clone()),
        vec![hash.clone(), second.clone()],
    )?;
    assert_eq!(resp.tree_id, 7);
    assert_eq!(resp.hash, hash);
    assert_eq!(resp.maybe_hash, Some(second.clone()));
    assert_eq!(resp.hashes, vec![hash, second]);
    eprintln!("echo_client(rust): EchoAliases OK");

    // Shutdown
    client.shutdown()?;
    eprintln!("echo_client(rust): all tests passed");
    Ok(())
}
