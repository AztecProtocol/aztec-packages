//! Generic IPC client over Unix Domain Sockets.
//! Handles: socket connect, length-prefixed framing, send/receive raw bytes.
//! Service-specific typed methods are in the generated wrapper.

use std::io::{Read, Write};
use std::os::unix::net::UnixStream;

pub struct IpcClient {
    stream: UnixStream,
}

impl IpcClient {
    pub fn connect(socket_path: &str) -> std::io::Result<Self> {
        let stream = UnixStream::connect(socket_path)?;
        Ok(Self { stream })
    }

    /// Send a msgpack request and receive the raw response bytes.
    pub fn call(&mut self, request: &[u8]) -> std::io::Result<Vec<u8>> {
        // Send length-prefixed
        let len = (request.len() as u32).to_le_bytes();
        self.stream.write_all(&len)?;
        self.stream.write_all(request)?;
        self.stream.flush()?;

        // Read response length
        let mut len_buf = [0u8; 4];
        self.stream.read_exact(&mut len_buf)?;
        let resp_len = u32::from_le_bytes(len_buf) as usize;

        // Read response payload
        let mut resp = vec![0u8; resp_len];
        self.stream.read_exact(&mut resp)?;
        Ok(resp)
    }
}

impl Drop for IpcClient {
    fn drop(&mut self) {
        let _ = self.stream.shutdown(std::net::Shutdown::Both);
    }
}
