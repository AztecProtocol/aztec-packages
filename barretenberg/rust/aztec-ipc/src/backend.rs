//! Backend trait for IPC communication
//!
//! All IPC service clients use this trait to abstract the transport layer.
//! Implementations include UDS (Unix Domain Socket) and pipe backends.

use crate::error::Result;

/// Transport backend for IPC service communication.
///
/// Handles the raw msgpack byte exchange: send a request, receive a response.
/// The framing (4-byte LE length prefix) is handled by the backend implementation.
pub trait Backend {
    /// Send a msgpack request and receive the msgpack response.
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>>;

    /// Clean up resources and close the connection.
    fn destroy(&mut self) -> Result<()>;
}
