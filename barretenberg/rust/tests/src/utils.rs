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
            // From rust/tests, need to go up two levels to barretenberg/
            "../../cpp/build/bin/bb".to_string()
        })
}

/// Check if BB binary exists at the expected path
pub fn bb_binary_exists() -> bool {
    let path = get_bb_binary_path();
    std::path::Path::new(&path).exists()
}

/// Skip test if BB binary is not available
#[macro_export]
macro_rules! require_bb_binary {
    () => {
        if !$crate::utils::bb_binary_exists() {
            eprintln!("Skipping test: BB binary not found at {}", $crate::utils::get_bb_binary_path());
            return;
        }
    };
}
