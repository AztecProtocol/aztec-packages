//! Shared memory backend for Barretenberg
//!
//! This backend communicates with the BB binary via shared memory IPC,
//! using a C++ shared memory server. The Rust side acts as a client.

use crate::backend::Backend;
use crate::error::{BarretenbergError, Result};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

/// Shared memory backend implementation
///
/// NOTE: This is a simplified implementation that uses shared memory via
/// a C wrapper. A full implementation would require:
/// 1. FFI bindings to the C++ MsgpackClient
/// 2. Or a pure Rust implementation of the shared memory protocol
///
/// For now, this demonstrates the structure and delegates to a hypothetical
/// native library or falls back to socket-based communication.
pub struct SharedMemoryBackend {
    #[allow(dead_code)]
    shm_name: String,
    process: Option<Child>,
    // In a real implementation, this would hold the shared memory handle
    // For now, we use a simplified approach
    _marker: std::marker::PhantomData<()>,
}

impl SharedMemoryBackend {
    /// Create a new shared memory backend by spawning the BB process
    ///
    /// # Arguments
    /// * `bb_binary_path` - Path to the BB binary
    /// * `shm_name` - Name for the shared memory region
    /// * `threads` - Number of threads for BB to use
    /// * `max_clients` - Maximum number of concurrent clients
    pub fn new(
        bb_binary_path: impl AsRef<Path>,
        shm_name: impl Into<String>,
        threads: Option<usize>,
        max_clients: Option<usize>,
    ) -> Result<Self> {
        let shm_name = shm_name.into();
        let shm_path = format!("{}.shm", shm_name);

        // Build command
        let mut cmd = Command::new(bb_binary_path.as_ref());
        cmd.arg("msgpack")
            .arg("run")
            .arg(&shm_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(t) = threads {
            cmd.arg("--threads").arg(t.to_string());
        }

        if let Some(mc) = max_clients {
            cmd.arg("--max-clients").arg(mc.to_string());
        }

        // Spawn the process
        let process = cmd.spawn()
            .map_err(|e| BarretenbergError::Backend(format!("Failed to spawn BB process: {}", e)))?;

        // Wait a bit for the shared memory region to be initialized
        std::thread::sleep(Duration::from_millis(500));

        Ok(Self {
            shm_name,
            process: Some(process),
            _marker: std::marker::PhantomData,
        })
    }

    /// Call the backend via shared memory
    ///
    /// NOTE: This is a placeholder. A real implementation would:
    /// 1. Use FFI to call into a C++ wrapper around MsgpackClient
    /// 2. Or implement the shared memory protocol in pure Rust
    ///
    /// For demonstration, this returns an error indicating it needs native support.
    fn call_impl(&mut self, _input_buffer: &[u8]) -> Result<Vec<u8>> {
        Err(BarretenbergError::Backend(
            "Shared memory backend requires native FFI bindings. \
             Use UnixSocketBackend as an alternative.".to_string()
        ))
    }
}

impl Backend for SharedMemoryBackend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        self.call_impl(input)
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

impl Drop for SharedMemoryBackend {
    fn drop(&mut self) {
        let _ = self.destroy();
    }
}

// NOTE: For a production implementation, you would need:
//
// 1. C++ wrapper (msgpack_client_rust.cpp):
//    ```cpp
//    extern "C" {
//        void* msgpack_client_create(const char* shm_name);
//        int msgpack_client_call(void* client, const uint8_t* input, size_t input_len,
//                                uint8_t** output, size_t* output_len);
//        void msgpack_client_destroy(void* client);
//    }
//    ```
//
// 2. Rust FFI bindings:
//    ```rust
//    #[link(name = "msgpack_client_rust")]
//    extern "C" {
//        fn msgpack_client_create(shm_name: *const c_char) -> *mut c_void;
//        fn msgpack_client_call(
//            client: *mut c_void,
//            input: *const u8,
//            input_len: usize,
//            output: *mut *mut u8,
//            output_len: *mut usize,
//        ) -> c_int;
//        fn msgpack_client_destroy(client: *mut c_void);
//    }
//    ```
//
// 3. Build script to compile and link the C++ wrapper
