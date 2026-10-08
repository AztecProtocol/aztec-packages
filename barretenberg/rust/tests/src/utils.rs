//! Utility functions and helpers for tests

use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::Instant;

use barretenberg_rs::{ipc_runtime::IpcClient, Backend, BarretenbergError, BbApi, Fr, Result};

/// Generate a pseudo-random Fr for testing (NOT cryptographically secure)
pub fn random_fr() -> Fr {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_nanos();

    let mut bytes = [0u8; 32];
    bytes[0..16].copy_from_slice(&nanos.to_le_bytes());
    bytes[16..24].copy_from_slice(&(nanos >> 64).to_le_bytes()[0..8]);
    Fr::from_be_bytes(bytes)
}

/// Timer for performance measurements
///
/// Parallels the Timer class in barretenberg/ts/bb.js/src/benchmark/timer.ts
pub struct Timer {
    start: Instant,
}

impl Timer {
    /// Create a new timer starting now
    pub fn new() -> Self {
        Self {
            start: Instant::now(),
        }
    }

    /// Get elapsed time in microseconds
    pub fn us(&self) -> u128 {
        self.start.elapsed().as_micros()
    }

    /// Get elapsed time in milliseconds
    pub fn ms(&self) -> u128 {
        self.start.elapsed().as_millis()
    }

    /// Get elapsed time in seconds
    pub fn s(&self) -> f64 {
        self.start.elapsed().as_secs_f64()
    }
}

impl Default for Timer {
    fn default() -> Self {
        Self::new()
    }
}

/// A `bb msgpack run` child driven over its stdin/stdout pipe.
pub struct BbProcess {
    client: IpcClient,
    child: Option<Child>,
}

impl BbProcess {
    pub fn spawn(bb_path: impl AsRef<Path>) -> Self {
        use std::os::fd::AsRawFd;

        let child = Command::new(bb_path.as_ref())
            .args(["msgpack", "run"])
            .env("HARDWARE_CONCURRENCY", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("Failed to spawn bb");
        let out_fd = child.stdin.as_ref().unwrap().as_raw_fd();
        let in_fd = child.stdout.as_ref().unwrap().as_raw_fd();
        // SAFETY: both descriptors belong to `child`, which outlives the
        // client; the client duplicates them.
        let client = unsafe { IpcClient::from_fds(in_fd, out_fd) }.expect("Failed to connect to bb");
        Self { client, child: Some(child) }
    }
}

impl Backend for BbProcess {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        self.client.call(input).map_err(|e| BarretenbergError::Backend(e.to_string()))
    }

    fn destroy(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }
}

impl Drop for BbProcess {
    fn drop(&mut self) {
        let _ = self.destroy();
    }
}

/// Spawn bb and wrap it in a client.
pub fn spawn_bb(bb_path: &str) -> BbApi<BbProcess> {
    BbApi::new(BbProcess::spawn(bb_path))
}

/// Get path to BB binary for testing
pub fn get_bb_binary_path() -> String {
    std::env::var("BB_BINARY_PATH")
        .unwrap_or_else(|_| {
            // Default path relative to the repository root
            // From rust/tests, need to go up two levels to barretenberg/
            "../../cpp/build/bin/bb".to_string()
        })
}

/// Check if BB binary exists at the expected path
pub fn bb_binary_exists() -> bool {
    let path = get_bb_binary_path();
    std::path::Path::new(&path).exists()
}

/// Check if BB binary supports the msgpack API
pub fn bb_supports_msgpack() -> bool {
    let path = get_bb_binary_path();
    if !std::path::Path::new(&path).exists() {
        return false;
    }

    // Try to run `bb --help` and check if "msgpack" appears in the output
    // This is more reliable than checking exit codes
    match std::process::Command::new(&path)
        .args(["--help"])
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.contains("msgpack")
        }
        Err(_) => false,
    }
}

/// Require BB binary with msgpack support.
/// Panics if BB binary is not found or doesn't support msgpack API.
#[macro_export]
macro_rules! require_bb_binary {
    () => {
        if !$crate::utils::bb_binary_exists() {
            panic!("BB binary not found at {}. Build it with `./bootstrap.sh` or set BB_BINARY_PATH.",
                   $crate::utils::get_bb_binary_path());
        }
        if !$crate::utils::bb_supports_msgpack() {
            panic!("BB binary at {} does not support msgpack API. Rebuild with latest code.",
                   $crate::utils::get_bb_binary_path());
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bb_binary_detection() {
        let path = get_bb_binary_path();
        eprintln!("BB_BINARY_PATH: {}", path);
        eprintln!("bb_binary_exists: {}", bb_binary_exists());
        eprintln!("bb_supports_msgpack: {}", bb_supports_msgpack());
    }
}
