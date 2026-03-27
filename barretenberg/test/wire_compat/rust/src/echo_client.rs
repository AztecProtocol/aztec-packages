//! Echo IPC client — connects, sends test commands, verifies responses.
//! Usage: echo_client --socket /tmp/echo.sock
//! Exits 0 on success, 1 on failure.

use echo_wire_compat::types_gen::*;
use echo_wire_compat::error::{EchoError, Result};
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;

fn send_recv(stream: &mut UnixStream, command: Command) -> Result<Response> {
    // Serialize as [command] (tuple wrapper)
    let payload = rmp_serde::to_vec_named(&vec![command])
        .map_err(|e| EchoError::Serialization(e.to_string()))?;

    // Send length-prefixed
    let len = (payload.len() as u32).to_le_bytes();
    stream.write_all(&len)?;
    stream.write_all(&payload)?;
    stream.flush()?;

    // Read response length
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf)?;
    let resp_len = u32::from_le_bytes(len_buf) as usize;

    // Read response payload
    let mut resp_payload = vec![0u8; resp_len];
    stream.read_exact(&mut resp_payload)?;

    let response: Response = rmp_serde::from_slice(&resp_payload)
        .map_err(|e| EchoError::Deserialization(e.to_string()))?;

    Ok(response)
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let socket_path = args.iter()
        .position(|a| a == "--socket")
        .and_then(|i| args.get(i + 1))
        .expect("Usage: echo_client --socket <path>");

    let mut stream = UnixStream::connect(socket_path)?;

    // Test 1: EchoBytes
    let test_data = vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42];
    let cmd = Command::EchoBytes(EchoBytes::new(test_data.clone()));
    match send_recv(&mut stream, cmd)? {
        Response::EchoBytesResponse(resp) => {
            assert_eq!(resp.data, test_data, "EchoBytes data mismatch");
            eprintln!("echo_client(rust): EchoBytes OK");
        }
        other => {
            eprintln!("echo_client(rust): EchoBytes unexpected response: {:?}", other);
            std::process::exit(1);
        }
    }

    // Test 2: EchoFields
    let cmd = Command::EchoFields(EchoFields::new(42, 999999, "hello wire compat".to_string()));
    match send_recv(&mut stream, cmd)? {
        Response::EchoFieldsResponse(resp) => {
            assert_eq!(resp.a, 42);
            assert_eq!(resp.b, 999999);
            assert_eq!(resp.name, "hello wire compat");
            eprintln!("echo_client(rust): EchoFields OK");
        }
        other => {
            eprintln!("echo_client(rust): EchoFields unexpected response: {:?}", other);
            std::process::exit(1);
        }
    }

    // Test 3: EchoNested
    let inner = EchoInner {
        values: vec![vec![1, 2, 3], vec![4, 5]],
        flag: Some(true),
    };
    let cmd = Command::EchoNested(EchoNested::new(inner.clone()));
    match send_recv(&mut stream, cmd)? {
        Response::EchoNestedResponse(resp) => {
            assert_eq!(resp.inner.values, inner.values);
            assert_eq!(resp.inner.flag, inner.flag);
            eprintln!("echo_client(rust): EchoNested OK");
        }
        other => {
            eprintln!("echo_client(rust): EchoNested unexpected response: {:?}", other);
            std::process::exit(1);
        }
    }

    // Shutdown
    let cmd = Command::EchoShutdown(EchoShutdown::new());
    let _ = send_recv(&mut stream, cmd);
    eprintln!("echo_client(rust): all tests passed");
    Ok(())
}
