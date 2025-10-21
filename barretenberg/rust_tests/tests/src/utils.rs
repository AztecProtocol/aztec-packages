//! Utility functions and helpers for tests

use std::time::Instant;

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

/// Get path to BB binary for testing
pub fn get_bb_binary_path() -> String {
    std::env::var("BB_BINARY_PATH")
        .unwrap_or_else(|_| {
            // Default path relative to the repository root
            "../cpp/build/bin/bb".to_string()
        })
}

/// Get a unique socket path for testing
pub fn get_test_socket_path(test_name: &str) -> String {
    format!("/tmp/bb_test_{}_{}.sock", test_name, std::process::id())
}
