//! Utility functions and helpers for tests

use std::time::Instant;
use barretenberg_rs::Fr;

/// Create an Fr from a u64 value (big-endian, zero-padded)
pub fn fr_from_u64(val: u64) -> Fr {
    let mut bytes = [0u8; 32];
    bytes[24..32].copy_from_slice(&val.to_be_bytes());
    Fr(bytes)
}

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
    Fr(bytes)
}

/// Timer for performance measurements
///
/// Parallels the Timer class in barretenberg/ts/src/benchmark/timer.ts
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

/// Spawn a BB process and connect via UDS.
/// Returns the BbApi and the child process handle.
pub fn spawn_bb_api() -> (barretenberg_rs::BbApi<barretenberg_rs::UdsBackend>, std::process::Child) {
    use std::process::{Command, Stdio};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::thread;
    use std::time::Duration;

    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let id = COUNTER.fetch_add(1, Ordering::SeqCst);

    let bb_path = get_bb_binary_path();
    let socket_path = format!("/tmp/bb-test-{}-{}.sock", std::process::id(), id);

    // Clean up any stale socket
    let _ = std::fs::remove_file(&socket_path);

    // Spawn bb in msgpack UDS server mode
    let child = Command::new(&bb_path)
        .args(["msgpack", "run", "--input", &socket_path])
        .env("HARDWARE_CONCURRENCY", "1")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("Failed to spawn bb binary");

    // Wait for socket to appear
    for _ in 0..30 {
        if std::path::Path::new(&socket_path).exists() {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }

    let backend = barretenberg_rs::UdsBackend::connect(&socket_path)
        .expect("Failed to connect to bb UDS socket");
    let api = barretenberg_rs::BbApi::new(backend);

    (api, child)
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
