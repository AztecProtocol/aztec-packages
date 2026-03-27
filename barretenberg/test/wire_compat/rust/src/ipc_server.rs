//! Generic IPC server over Unix Domain Sockets.
//! Handles: socket setup, accept, length-prefixed framing, msgpack decode/encode.
//! Service-specific dispatch is injected via the dispatch function parameter.

use std::io::{Read, Write};
use std::os::unix::net::UnixListener;

/// Dispatch function signature: takes raw command name + msgpack bytes, returns response name + bytes
pub type DispatchFn = Box<dyn Fn(&[u8]) -> Vec<u8>>;

/// Run an IPC server. Accepts one connection, serves until disconnect or shutdown.
pub fn serve(socket_path: &str, handler: impl Fn(&[u8]) -> Vec<u8>) -> std::io::Result<()> {
    let _ = std::fs::remove_file(socket_path);
    let listener = UnixListener::bind(socket_path)?;
    eprintln!("ipc-server(rust): listening on {}", socket_path);

    let (mut stream, _) = listener.accept()?;

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

        // Check for shutdown
        let is_shutdown = payload.windows(8).any(|w| w == b"Shutdown");

        // Dispatch
        let response = handler(&payload);

        // Send length-prefixed response
        let resp_len = (response.len() as u32).to_le_bytes();
        stream.write_all(&resp_len)?;
        stream.write_all(&response)?;
        stream.flush()?;

        if is_shutdown {
            break;
        }
    }

    let _ = std::fs::remove_file(socket_path);
    eprintln!("ipc-server(rust): shutdown");
    Ok(())
}
