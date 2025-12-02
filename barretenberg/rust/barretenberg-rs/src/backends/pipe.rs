//! Pipe backend for Barretenberg
//!
//! This backend communicates with the BB binary via stdin/stdout pipes,
//! using a 4-byte little-endian length prefix protocol.

use crate::backend::Backend;
use crate::error::{BarretenbergError, Result};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

/// Pipe backend implementation using stdin/stdout
pub struct PipeBackend {
    stdin: ChildStdin,
    stdout: ChildStdout,
    process: Option<Child>,
}

impl PipeBackend {
    /// Create a new pipe backend by spawning the BB process
    ///
    /// # Arguments
    /// * `bb_binary_path` - Path to the BB binary
    /// * `threads` - Number of threads for BB to use
    pub fn new(bb_binary_path: impl AsRef<Path>, threads: Option<usize>) -> Result<Self> {
        // Build command
        let mut cmd = Command::new(bb_binary_path.as_ref());
        cmd.arg("msgpack")
            .arg("run")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        // Note: BB uses HARDWARE_CONCURRENCY env var for thread control
        if let Some(t) = threads {
            cmd.env("HARDWARE_CONCURRENCY", t.to_string());
        }

        // Spawn the process
        let mut process = cmd.spawn()
            .map_err(|e| BarretenbergError::Backend(format!("Failed to spawn BB process: {}", e)))?;

        // Take stdin and stdout handles
        let stdin = process.stdin.take()
            .ok_or_else(|| BarretenbergError::Backend("Failed to get stdin handle".to_string()))?;
        let stdout = process.stdout.take()
            .ok_or_else(|| BarretenbergError::Backend("Failed to get stdout handle".to_string()))?;

        // Check if process exited immediately (indicates startup failure)
        if let Ok(Some(status)) = process.try_wait() {
            return Err(BarretenbergError::Backend(
                format!("BB process exited immediately with status: {}", status)
            ));
        }

        Ok(Self {
            stdin,
            stdout,
            process: Some(process),
        })
    }

    /// Send data with length prefix
    fn send_with_prefix(&mut self, data: &[u8]) -> Result<()> {
        let len = data.len() as u32;
        self.stdin.write_all(&len.to_le_bytes())
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to write length: {}", e)))?;
        self.stdin.write_all(data)
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to write data: {}", e)))?;
        self.stdin.flush()
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to flush stdin: {}", e)))?;
        Ok(())
    }

    /// Receive data with length prefix
    fn receive_with_prefix(&mut self) -> Result<Vec<u8>> {
        let mut len_buf = [0u8; 4];
        self.stdout.read_exact(&mut len_buf)
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to read length: {}", e)))?;

        let len = u32::from_le_bytes(len_buf) as usize;

        let mut data = vec![0u8; len];
        self.stdout.read_exact(&mut data)
            .map_err(|e| BarretenbergError::Ipc(format!("Failed to read data: {}", e)))?;

        Ok(data)
    }
}

impl Backend for PipeBackend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        self.send_with_prefix(input)?;
        self.receive_with_prefix()
    }

    fn destroy(&mut self) -> Result<()> {
        // Kill the process if it's still running
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }

        Ok(())
    }
}

impl Drop for PipeBackend {
    fn drop(&mut self) {
        let _ = self.destroy();
    }
}
