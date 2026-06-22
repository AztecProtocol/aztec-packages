//! Backend trait for msgpack communication
//!
//! This module defines a simple, pluggable interface for byte backends.
//! Users can easily implement custom backends (FFI, WASM, IPC, etc.).

use super::error::Result;

/// Simple interface for msgpack backend implementations.
///
/// Implement this trait to create a custom backend for a generated client.
/// The backend handles msgpack-encoded command/response communication.
///
/// # Example
///
/// ```ignore
/// struct MyCustomBackend {
///     // your FFI handle, connection, etc.
/// }
///
/// impl Backend for MyCustomBackend {
///     fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
///         // Send input to your backend
///         // Return the response
///     }
///
///     fn destroy(&mut self) -> Result<()> {
///         // Clean up resources
///         Ok(())
///     }
/// }
/// ```
pub trait Backend {
    /// Execute a msgpack command and return the msgpack response.
    ///
    /// # Arguments
    /// * `input` - Msgpack-encoded command
    ///
    /// # Returns
    /// Msgpack-encoded response
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>>;

    /// Clean up resources and shutdown the backend.
    fn destroy(&mut self) -> Result<()>;
}

// Bridge impl so ipc_runtime::IpcClient (UDS / MPSC-SHM transport) plugs
// directly into any generated <Service>Api as the Backend. Gated behind the
// consumer crate's `ipc-runtime` feature so FFI-only consumers don't need
// the ipc-runtime dependency at all:
//
//     [features]
//     default = ["ipc-runtime"]
//     ipc-runtime = ["dep:ipc-runtime"]
#[cfg(feature = "ipc-runtime")]
impl Backend for ipc_runtime::IpcClient {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        ipc_runtime::IpcClient::call(self, input)
            .map_err(|e| super::error::IpcError::Backend(e.to_string()))
    }
    fn destroy(&mut self) -> Result<()> {
        Ok(())
    }
}
