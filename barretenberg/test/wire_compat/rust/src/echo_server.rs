//! Echo IPC server — echoes commands back as responses.
//! Usage: echo_server --socket /tmp/echo.sock

use echo_wire_compat::generated_types::*;
use echo_wire_compat::server::Handler;
use echo_wire_compat::error::{EchoError, Result};
use std::io::{Read, Write};
use std::os::unix::net::UnixListener;

struct EchoHandler;

impl Handler for EchoHandler {
    fn bytes(&mut self, cmd: EchoBytes) -> Result<EchoBytesResponse> {
        Ok(EchoBytesResponse { data: cmd.data })
    }
    fn fields(&mut self, cmd: EchoFields) -> Result<EchoFieldsResponse> {
        Ok(EchoFieldsResponse { a: cmd.a, b: cmd.b, name: cmd.name })
    }
    fn nested(&mut self, cmd: EchoNested) -> Result<EchoNestedResponse> {
        Ok(EchoNestedResponse { inner: cmd.inner })
    }
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let socket_path = args.iter()
        .position(|a| a == "--socket")
        .and_then(|i| args.get(i + 1))
        .expect("Usage: echo_server --socket <path>");

    // Remove stale socket
    let _ = std::fs::remove_file(socket_path);

    let listener = UnixListener::bind(socket_path)?;
    eprintln!("echo_server(rust): listening on {}", socket_path);

    let (mut stream, _) = listener.accept()?;
    let mut handler = EchoHandler;

    loop {
        // Read 4-byte LE length
        let mut len_buf = [0u8; 4];
        if stream.read_exact(&mut len_buf).is_err() {
            break;
        }
        let len = u32::from_le_bytes(len_buf) as usize;

        // Read payload
        let mut payload = vec![0u8; len];
        stream.read_exact(&mut payload)?;

        // Deserialize: [[CommandName, {fields}]]
        let request: Vec<Command> = rmp_serde::from_slice(&payload)
            .map_err(|e| EchoError::Deserialization(e.to_string()))?;

        let command = request.into_iter().next()
            .ok_or_else(|| EchoError::Deserialization("empty request".into()))?;

        // Check for shutdown
        let is_shutdown = matches!(&command, Command::EchoShutdown(_));

        // Dispatch
        let response = match echo_wire_compat::server::dispatch(&mut handler, command) {
            Ok(resp) => resp,
            Err(e) => Response::EchoErrorResponse(EchoErrorResponse {
                message: e.to_string(),
            }),
        };

        // Serialize response
        let response_bytes = rmp_serde::to_vec_named(&response)
            .map_err(|e| EchoError::Serialization(e.to_string()))?;

        // Send length-prefixed response
        let resp_len = (response_bytes.len() as u32).to_le_bytes();
        stream.write_all(&resp_len)?;
        stream.write_all(&response_bytes)?;
        stream.flush()?;

        if is_shutdown {
            break;
        }
    }

    let _ = std::fs::remove_file(socket_path);
    eprintln!("echo_server(rust): shutdown");
    Ok(())
}
