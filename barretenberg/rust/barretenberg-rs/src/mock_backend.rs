//! Mock backend for testing and development
//!
//! This module provides a `MockBackend` that can be used to test code
//! without requiring the actual Barretenberg binary. It returns predefined
//! responses for common commands.
//!
//! # Example
//!
//! ```
//! use barretenberg_rs::{BarretenbergApi, mock_backend::MockBackend};
//!
//! let backend = MockBackend::new();
//! let mut api = BarretenbergApi::new(backend);
//!
//! // Call methods - they return mock responses
//! let response = api.blake2s(b"test data").unwrap();
//! assert_eq!(response.hash.len(), 32);
//! ```

use crate::backend::Backend;
use crate::error::{BarretenbergError, Result};
use crate::generated_types::{
    AffineElement, Blake2sResponse, Blake2sToFieldResponse, CircuitComputeVkResponse,
    CircuitInfoResponse, CircuitProveResponse, CircuitVerifyResponse, PedersenCommitResponse,
    PedersenHashBufferResponse, PedersenHashResponse, Poseidon2HashAccumulateResponse,
    Poseidon2HashResponse, Response, ShutdownResponse, SrsInitGrumpkinSrsResponse,
    SrsInitSrsResponse,
};

/// A mock backend for testing without the BB binary.
///
/// This backend returns predefined responses for all commands,
/// making it useful for:
/// - Unit testing code that uses the Barretenberg API
/// - Development without building the C++ binary
/// - Integration testing of the API layer
///
/// # Response Behavior
///
/// - `Blake2s`: Returns 32 zero bytes
/// - `Blake2sToField`: Returns 32 zero bytes
/// - `PedersenHash`: Returns 32 zero bytes
/// - `PedersenCommit`: Returns a point with 32 zero bytes for x and y
/// - `Poseidon2Hash`: Returns 32 zero bytes
/// - Other commands: Returns appropriate empty/default responses
#[derive(Debug, Default)]
pub struct MockBackend {
    /// Number of calls made to this backend
    pub call_count: usize,
    /// Last command type name received (for verification in tests)
    pub last_command: Option<String>,
}

impl MockBackend {
    /// Create a new mock backend
    pub fn new() -> Self {
        Self::default()
    }

    /// Get the number of calls made to this backend
    pub fn call_count(&self) -> usize {
        self.call_count
    }

    /// Get the last command type name that was called
    pub fn last_command(&self) -> Option<&str> {
        self.last_command.as_deref()
    }

    fn mock_response_by_name(&self, command_name: &str) -> Response {
        match command_name {
            "Blake2s" => Response::Blake2sResponse(Blake2sResponse {
                hash: vec![0u8; 32],
            }),
            "Blake2sToField" => Response::Blake2sToFieldResponse(Blake2sToFieldResponse {
                field: vec![0u8; 32],
            }),
            "PedersenHash" => Response::PedersenHashResponse(PedersenHashResponse {
                hash: vec![0u8; 32],
            }),
            "PedersenHashBuffer" => Response::PedersenHashBufferResponse(PedersenHashBufferResponse {
                hash: vec![0u8; 32],
            }),
            "PedersenCommit" => Response::PedersenCommitResponse(PedersenCommitResponse {
                point: AffineElement {
                    x: vec![0u8; 32],
                    y: vec![0u8; 32],
                },
            }),
            "Poseidon2Hash" => Response::Poseidon2HashResponse(Poseidon2HashResponse {
                hash: vec![0u8; 32],
            }),
            "Poseidon2HashAccumulate" => Response::Poseidon2HashAccumulateResponse(Poseidon2HashAccumulateResponse {
                hash: vec![0u8; 32],
            }),
            "SrsInitSrs" => Response::SrsInitSrsResponse(SrsInitSrsResponse { dummy: 0 }),
            "SrsInitGrumpkinSrs" => Response::SrsInitGrumpkinSrsResponse(SrsInitGrumpkinSrsResponse { dummy: 0 }),
            "Shutdown" => Response::ShutdownResponse(ShutdownResponse {}),
            // Circuit commands
            "CircuitProve" => Response::CircuitProveResponse(CircuitProveResponse {
                public_inputs: vec![],
                proof: vec![vec![0u8; 32]],
                vk: CircuitComputeVkResponse {
                    bytes: vec![0u8; 32],
                    fields: vec![],
                    hash: vec![0u8; 32],
                },
            }),
            "CircuitVerify" => Response::CircuitVerifyResponse(CircuitVerifyResponse {
                verified: true,
            }),
            "CircuitComputeVk" => Response::CircuitComputeVkResponse(CircuitComputeVkResponse {
                bytes: vec![0u8; 32],
                fields: vec![],
                hash: vec![0u8; 32],
            }),
            "CircuitStats" => Response::CircuitInfoResponse(CircuitInfoResponse {
                num_gates: 0,
                num_gates_dyadic: 0,
                num_acir_opcodes: 0,
                gates_per_opcode: vec![],
            }),
            // Default: return an empty shutdown response (safe fallback)
            _ => Response::ShutdownResponse(ShutdownResponse {}),
        }
    }
}

impl Backend for MockBackend {
    fn call(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        self.call_count += 1;

        // Commands are serialized as: array[ tuple["CommandName", {fields}] ]
        // We need to extract just the command name to determine the response type
        // Use rmpv to parse the raw msgpack without type constraints
        let value = rmpv::decode::read_value(&mut &input[..])
            .map_err(|e| BarretenbergError::Deserialization(format!("Failed to parse msgpack: {}", e)))?;

        // Extract command name from the structure: [[name, data]]
        let command_name = value.as_array()
            .and_then(|arr| arr.first())
            .and_then(|cmd| cmd.as_array())
            .and_then(|tuple| tuple.first())
            .and_then(|name| name.as_str())
            .ok_or_else(|| BarretenbergError::Deserialization("Invalid command structure".to_string()))?;

        self.last_command = Some(command_name.to_string());

        let response = self.mock_response_by_name(command_name);

        rmp_serde::to_vec(&response)
            .map_err(|e| BarretenbergError::Serialization(e.to_string()))
    }

    fn destroy(&mut self) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated_types::{Blake2s, Command};
    use crate::BarretenbergApi;

    #[test]
    fn test_mock_backend_blake2s() {
        let backend = MockBackend::new();
        let mut api = BarretenbergApi::new(backend);

        let result = api.blake2s(b"test data");
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.hash.len(), 32);
    }

    #[test]
    fn test_mock_backend_tracks_calls() {
        let mut backend = MockBackend::new();
        assert_eq!(backend.call_count(), 0);

        let cmd = Command::Blake2s(Blake2s::new(vec![1, 2, 3]));
        let input = rmp_serde::to_vec_named(&vec![cmd]).unwrap();

        let _ = backend.call(&input);
        assert_eq!(backend.call_count(), 1);
        assert_eq!(backend.last_command(), Some("Blake2s"));
    }

    #[test]
    fn test_mock_backend_pedersen() {
        let backend = MockBackend::new();
        let mut api = BarretenbergApi::new(backend);

        let result = api.pedersen_hash(vec![vec![0u8; 32]], 0);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.hash.len(), 32);
    }

    #[test]
    fn test_mock_backend_poseidon2() {
        let backend = MockBackend::new();
        let mut api = BarretenbergApi::new(backend);

        let result = api.poseidon2_hash(vec![vec![0u8; 32]]);
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response.hash.len(), 32);
    }
}
