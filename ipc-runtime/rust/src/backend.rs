//! Backend trait for msgpack communication
//!
//! This module defines a simple, pluggable interface for byte backends.
//! Users can easily implement custom backends (FFI, WASM, IPC, etc.).

use crate::error::Result;

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

/// A backend whose calls are awaited rather than blocked on: what a generated
/// `<Service>AsyncApi` runs over. [`AsyncHostCall`](crate::async_host::AsyncHostCall) is the one
/// a handler calls out through.
pub trait AsyncBackend {
    /// Send a msgpack command; resolves to the msgpack response.
    fn call(&self, input: Vec<u8>) -> impl std::future::Future<Output = Result<Vec<u8>>>;
}

// An IpcClient (UDS / MPSC-SHM transport) is a Backend for any generated <Service>Api.
#[cfg(feature = "sockets")]
impl Backend for crate::IpcClient {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        crate::IpcClient::call(self, input)
            .map_err(|e| crate::error::IpcError::Backend(e.to_string()))
    }
    fn destroy(&mut self) -> Result<()> {
        Ok(())
    }
}
