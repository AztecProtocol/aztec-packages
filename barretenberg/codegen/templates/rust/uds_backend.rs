//! UDS (Unix Domain Socket) backend for Barretenberg
//!
//! Connects to a running BB server over a Unix domain socket,
//! using the standard 4-byte LE length-prefixed msgpack protocol.
//! Same wire format as C++/TS/Zig IPC clients.

use super::backend::Backend;
use super::error::{BarretenbergError, Result};
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::Path;

/// UDS backend — connects to a BB server over Unix domain socket.
pub struct UdsBackend {
    stream: UnixStream,
}

impl UdsBackend {
    /// Connect to a BB server at the given socket path.
    ///
    /// # Arguments
    /// * `socket_path` - Path to the Unix domain socket (e.g. "/tmp/bb.sock")
    pub fn connect(socket_path: impl AsRef<Path>) -> Result<Self> {
        let stream = UnixStream::connect(socket_path.as_ref()).map_err(|e| {
            BarretenbergError::Ipc(format!(
                "Failed to connect to {}: {}",
                socket_path.as_ref().display(),
                e
            ))
        })?;
        Ok(Self { stream })
    }

    fn send_with_prefix(&mut self, data: &[u8]) -> Result<()> {
        let len = data.len() as u32;
        self.stream
            .write_all(&len.to_le_bytes())
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to write length: {}", e)))?;
        self.stream
            .write_all(data)
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to write data: {}", e)))?;
        self.stream
            .flush()
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to flush: {}", e)))?;
        Ok(())
    }

    fn receive_with_prefix(&mut self) -> Result<Vec<u8>> {
        let mut len_buf = [0u8; 4];
        self.stream
            .read_exact(&mut len_buf)
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to read length: {}", e)))?;
        let len = u32::from_le_bytes(len_buf) as usize;
        let mut data = vec![0u8; len];
        self.stream
            .read_exact(&mut data)
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to read data: {}", e)))?;
        Ok(data)
    }
}

impl Backend for UdsBackend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        self.send_with_prefix(input)?;
        self.receive_with_prefix()
    }

    fn destroy(&mut self) -> Result<()> {
        let _ = self.stream.shutdown(std::net::Shutdown::Both);
        Ok(())
    }
}

impl Drop for UdsBackend {
    fn drop(&mut self) {
        let _ = self.destroy();
    }
}
