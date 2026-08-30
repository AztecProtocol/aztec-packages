//! Back-compat `PipeBackend`, preserving the pre-migration constructor.
//!
//! The transport itself now lives in ipc-runtime: this spawns bb the way it
//! always did and drives the connection through `ipc_runtime::IpcClient`'s
//! pipe client, so no framing or fd handling is duplicated here.

use std::path::Path;
use std::process::{Child, Command, Stdio};

use crate::generated::backend::Backend;
use crate::generated::error::{IpcError, Result};

/// Deprecated: spawns bb and talks to it over its stdin/stdout.
///
/// Prefer driving [`ipc_runtime::IpcClient`] directly — it implements
/// [`Backend`] and also offers the UDS and shared-memory transports.
#[deprecated(note = "use ipc_runtime::IpcClient (from_fds / from_path) as the Backend")]
pub struct PipeBackend {
    client: ipc_runtime::IpcClient,
    process: Option<Child>,
}

#[allow(deprecated)]
impl PipeBackend {
    /// Spawn bb in msgpack mode and connect over its stdio pipes.
    pub fn new(bb_binary_path: impl AsRef<Path>, threads: Option<usize>) -> Result<Self> {
        use std::os::fd::AsRawFd;

        let mut cmd = Command::new(bb_binary_path.as_ref());
        cmd.arg("msgpack")
            .arg("run")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        // bb reads thread count from the environment.
        if let Some(t) = threads {
            cmd.env("HARDWARE_CONCURRENCY", t.to_string());
        }

        let mut process = cmd
            .spawn()
            .map_err(|e| IpcError::Backend(format!("Failed to spawn BB process: {e}")))?;

        let out_fd = process
            .stdin
            .as_ref()
            .ok_or_else(|| IpcError::Backend("Failed to get stdin handle".to_string()))?
            .as_raw_fd();
        let in_fd = process
            .stdout
            .as_ref()
            .ok_or_else(|| IpcError::Backend("Failed to get stdout handle".to_string()))?
            .as_raw_fd();

        if let Ok(Some(status)) = process.try_wait() {
            return Err(IpcError::Backend(format!(
                "BB process exited immediately with status: {status}"
            )));
        }

        // SAFETY: both descriptors belong to `process`, which this struct owns
        // for as long as the client lives. The client duplicates them, so the
        // two sides close independently.
        let client = unsafe { ipc_runtime::IpcClient::from_fds(in_fd, out_fd) }
            .map_err(|e| IpcError::Backend(format!("Failed to connect to BB process: {e}")))?;

        Ok(Self {
            client,
            process: Some(process),
        })
    }
}

#[allow(deprecated)]
impl Backend for PipeBackend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        self.client
            .call(input)
            .map_err(|e| IpcError::Backend(e.to_string()))
    }

    fn destroy(&mut self) -> Result<()> {
        if let Some(mut process) = self.process.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
        Ok(())
    }
}

#[allow(deprecated)]
impl Drop for PipeBackend {
    fn drop(&mut self) {
        let _ = self.destroy();
    }
}
