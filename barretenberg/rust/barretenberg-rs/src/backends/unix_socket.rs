//! Unix domain socket backend for Barretenberg
//!
//! This backend communicates with the BB binary via Unix domain sockets,
//! using a 4-byte little-endian length prefix protocol.

use crate::backend::Backend;
use crate::error::{BarretenbergError, Result};
use std::io::{Read, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::Duration;

/// Unix domain socket backend implementation
pub struct UnixSocketBackend {
    socket: UnixStream,
    socket_path: PathBuf,
    process: Option<Child>,
}

impl UnixSocketBackend {
    /// Create a new Unix socket backend by spawning the BB process
    ///
    /// # Arguments
    /// * `bb_binary_path` - Path to the BB binary
    /// * `socket_path` - Path for the Unix domain socket (must end with .sock)
    /// * `threads` - Number of threads for BB to use
    pub fn new(bb_binary_path: impl AsRef<Path>, socket_path: impl AsRef<Path>, threads: Option<usize>) -> Result<Self> {
        let socket_path = socket_path.as_ref().to_path_buf();

        // Ensure socket path ends with .sock
        if !socket_path.to_string_lossy().ends_with(".sock") {
            return Err(BarretenbergError::Backend(
                "Socket path must end with .sock".to_string()
            ));
        }

        // Remove existing socket file if it exists
        let _ = std::fs::remove_file(&socket_path);

        // Build command
        let mut cmd = Command::new(bb_binary_path.as_ref());
        cmd.arg("msgpack")
            .arg("run")
            .arg("--input")
            .arg(&socket_path)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

        // Note: BB uses HARDWARE_CONCURRENCY env var for thread control
        if let Some(t) = threads {
            cmd.env("HARDWARE_CONCURRENCY", t.to_string());
        }

        // Spawn the process
        let mut process = cmd.spawn()
            .map_err(|e| BarretenbergError::Backend(format!("Failed to spawn BB process: {}", e)))?;

        // Wait for socket file to be created
        let start = std::time::Instant::now();
        let timeout = Duration::from_secs(10);

        while !socket_path.exists() {
            if start.elapsed() > timeout {
                let _ = process.kill();
                return Err(BarretenbergError::Connection(
                    "Timeout waiting for socket file".to_string()
                ));
            }

            // Check if process has exited
            if let Ok(Some(status)) = process.try_wait() {
                return Err(BarretenbergError::Backend(
                    format!("BB process exited with status: {}", status)
                ));
            }

            std::thread::sleep(Duration::from_millis(100));
        }

        // Connect to the socket
        let socket = UnixStream::connect(&socket_path)
            .map_err(|e| BarretenbergError::Connection(format!("Failed to connect to socket: {}", e)))?;

        // Set timeouts
        socket.set_read_timeout(Some(Duration::from_secs(30)))
            .map_err(|e| BarretenbergError::Backend(format!("Failed to set read timeout: {}", e)))?;
        socket.set_write_timeout(Some(Duration::from_secs(30)))
            .map_err(|e| BarretenbergError::Backend(format!("Failed to set write timeout: {}", e)))?;

        Ok(Self {
            socket,
            socket_path,
            process: Some(process),
        })
    }

    /// Send data with length prefix
    fn send_with_prefix(&mut self, data: &[u8]) -> Result<()> {
        let len = data.len() as u32;
        self.socket.write_all(&len.to_le_bytes())
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to write length: {}", e)))?;
        self.socket.write_all(data)
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to write data: {}", e)))?;
        self.socket.flush()
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to flush socket: {}", e)))?;
        Ok(())
    }

    /// Receive data with length prefix
    fn receive_with_prefix(&mut self) -> Result<Vec<u8>> {
        let mut len_buf = [0u8; 4];
        self.socket.read_exact(&mut len_buf)
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to read length: {}", e)))?;

        let len = u32::from_le_bytes(len_buf) as usize;

        let mut data = vec![0u8; len];
        self.socket.read_exact(&mut data)
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to read data: {}", e)))?;

        Ok(data)
    }
}

impl Backend for UnixSocketBackend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        self.send_with_prefix(input)?;
        self.receive_with_prefix()
    }

    fn destroy(&mut self) -> Result<()> {
        // Cleanup socket file
        let _ = std::fs::remove_file(&self.socket_path);

        // Kill the process if it's still running
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }

        Ok(())
    }
}

impl Drop for UnixSocketBackend {
    fn drop(&mut self) {
        let _ = self.destroy();
    }
}
