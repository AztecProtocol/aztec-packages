//! Unix Domain Socket backend for IPC services
//!
//! Connects to a service (wsdb, cdb, avm) via UDS and exchanges
//! length-prefixed msgpack messages.

use crate::backend::Backend;
use crate::error::{IpcError, Result};
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::Path;

/// UDS backend that connects to an IPC service socket.
pub struct UdsBackend {
    stream: UnixStream,
}

impl UdsBackend {
    /// Connect to a service at the given socket path.
    pub fn connect(socket_path: impl AsRef<Path>) -> Result<Self> {
        let stream = UnixStream::connect(socket_path.as_ref()).map_err(|e| {
            IpcError::Connection(format!(
                "Failed to connect to {}: {}",
                socket_path.as_ref().display(),
                e
            ))
        })?;
        Ok(Self { stream })
    }

    /// Send a length-prefixed message.
    fn send(&mut self, data: &[u8]) -> Result<()> {
        let len = data.len() as u32;
        self.stream.write_all(&len.to_le_bytes())?;
        self.stream.write_all(data)?;
        self.stream.flush()?;
        Ok(())
    }

    /// Receive a length-prefixed message.
    fn receive(&mut self) -> Result<Vec<u8>> {
        let mut len_buf = [0u8; 4];
        self.stream.read_exact(&mut len_buf)?;
        let len = u32::from_le_bytes(len_buf) as usize;

        let mut data = vec![0u8; len];
        self.stream.read_exact(&mut data)?;
        Ok(data)
    }
}

impl Backend for UdsBackend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        self.send(input)?;
        self.receive()
    }

    fn destroy(&mut self) -> Result<()> {
        self.stream.shutdown(std::net::Shutdown::Both)?;
        Ok(())
    }
}

impl Drop for UdsBackend {
    fn drop(&mut self) {
        let _ = self.stream.shutdown(std::net::Shutdown::Both);
    }
}
