//! Backend trait for msgpack communication
//!
//! This module defines a simple, pluggable interface for Barretenberg backends.
//! Users can easily implement custom backends (FFI, WASM, IPC, etc.).

use crate::error::Result;

/// Simple interface for msgpack backend implementations.
///
/// Implement this trait to create a custom backend for Barretenberg.
/// The backend handles msgpack-encoded command/response communication.
///
/// # Implementation Requirements
///
/// Implementors **must** also implement [`Drop`] to ensure cleanup happens
/// even if [`Backend::destroy`] is not called explicitly. The `destroy` method
/// exists to allow error reporting during cleanup, which `Drop` cannot provide.
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
///
/// impl Drop for MyCustomBackend {
///     fn drop(&mut self) {
///         // Best-effort cleanup (errors cannot be reported)
///         let _ = self.destroy();
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
