//! Backend trait definitions for msgpack communication
//!
//! This module defines the core traits that all Barretenberg backends must implement.
//! Backends can be synchronous or asynchronous and communicate via msgpack protocol.

use crate::error::Result;

/// Generic interface for msgpack backend implementations.
///
/// Both WASM and native binary backends implement this interface.
/// The protocol uses msgpack encoding with a 4-byte little-endian length prefix
/// for native backends (shared memory, Unix sockets).
pub trait MsgpackBackend {
    /// Execute a msgpack command and return the msgpack response.
    ///
    /// # Arguments
    /// * `input_buffer` - The msgpack-encoded input buffer containing the command
    ///
    /// # Returns
    /// The msgpack-encoded response buffer
    fn call(&mut self, input_buffer: &[u8]) -> Result<Vec<u8>>;

    /// Clean up resources and shutdown the backend.
    fn destroy(&mut self) -> Result<()>;
}

/// Synchronous variant of MsgpackBackend.
///
/// Used for blocking operations, typically with shared memory backends.
pub trait MsgpackBackendSync: MsgpackBackend {
    /// Execute a msgpack command synchronously.
    fn call_sync(&mut self, input_buffer: &[u8]) -> Result<Vec<u8>> {
        self.call(input_buffer)
    }
}

/// Asynchronous variant of MsgpackBackend.
///
/// Used for non-blocking operations with Unix sockets or WASM backends.
#[cfg(feature = "async")]
pub trait MsgpackBackendAsync: Send + Sync {
    /// Execute a msgpack command asynchronously.
    ///
    /// # Arguments
    /// * `input_buffer` - The msgpack-encoded input buffer containing the command
    ///
    /// # Returns
    /// A future that resolves to the msgpack-encoded response buffer
    fn call_async(&mut self, input_buffer: &[u8]) -> impl std::future::Future<Output = Result<Vec<u8>>> + Send;

    /// Clean up resources and shutdown the backend asynchronously.
    fn destroy_async(&mut self) -> impl std::future::Future<Output = Result<()>> + Send;
}

/// Helper function to encode a command with length prefix for native backends
pub fn encode_with_length_prefix(data: &[u8]) -> Vec<u8> {
    let len = data.len() as u32;
    let mut result = Vec::with_capacity(4 + data.len());
    result.extend_from_slice(&len.to_le_bytes());
    result.extend_from_slice(data);
    result
}

/// Helper function to decode data with length prefix for native backends
pub fn decode_with_length_prefix(data: &[u8]) -> Result<(u32, &[u8])> {
    if data.len() < 4 {
        return Err(crate::error::BarretenbergError::Deserialization(
            "Buffer too small for length prefix".to_string()
        ));
    }

    let len = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let payload = &data[4..];

    Ok((len, payload))
}
