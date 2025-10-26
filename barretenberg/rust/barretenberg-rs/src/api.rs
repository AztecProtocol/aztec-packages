//! High-level API for Barretenberg operations

use crate::backend::MsgpackBackendSync;
use crate::error::{BarretenbergError, Result};
use crate::generated_types::*;

#[cfg(feature = "async")]
use crate::backend::MsgpackBackendAsync;

// Response type aliases for convenience
pub type Blake2sResponse = crate::generated_types::Blake2sResponse;
pub type Blake2sToFieldResponse = crate::generated_types::Blake2sToFieldResponse;
pub type PedersenHashResponse = crate::generated_types::PedersenHashResponse;
pub type PedersenHashBufferResponse = crate::generated_types::PedersenHashBufferResponse;
pub type PedersenCommitResponse = crate::generated_types::PedersenCommitResponse;
pub type Poseidon2HashResponse = crate::generated_types::Poseidon2HashResponse;

/// Synchronous Barretenberg API
pub struct BarretenbergApiSync<B: MsgpackBackendSync> {
    backend: B,
}

impl<B: MsgpackBackendSync> BarretenbergApiSync<B> {
    /// Create a new synchronous API instance with the given backend
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    /// Execute a command and get a response
    fn execute(&mut self, command: Command) -> Result<Response> {
        // Wrap command in array (tuple of arguments)
        let wrapped = vec![command];

        // Serialize to msgpack
        let input_buffer = rmp_serde::to_vec(&wrapped)
            .map_err(|e| BarretenbergError::Serialization(e.to_string()))?;

        // Call backend
        let output_buffer = self.backend.call(&input_buffer)?;

        // Deserialize response
        let response: Response = rmp_serde::from_slice(&output_buffer)
            .map_err(|e| BarretenbergError::Deserialization(e.to_string()))?;

        Ok(response)
    }

    /// Compute Blake2s hash
    pub fn blake2s(&mut self, data: &[u8]) -> Result<Blake2sResponse> {
        let cmd = Command::Blake2s(Blake2s::new(data.to_vec()));

        match self.execute(cmd)? {
            Response::Blake2sResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected Blake2sResponse response".to_string())),
        }
    }

    /// Compute Blake2s hash and convert to field element
    pub fn blake2s_to_field(&mut self, data: &[u8]) -> Result<Blake2sToFieldResponse> {
        let cmd = Command::Blake2sToField(Blake2sToField::new(data.to_vec()));

        match self.execute(cmd)? {
            Response::Blake2sToFieldResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected Blake2sToFieldResponse response".to_string())),
        }
    }

    /// Compute Pedersen hash
    pub fn pedersen_hash(&mut self, inputs: Vec<Vec<u8>>, hash_index: u32) -> Result<PedersenHashResponse> {
        let cmd = Command::PedersenHash(PedersenHash::new(inputs, hash_index));

        match self.execute(cmd)? {
            Response::PedersenHashResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected PedersenHashResponse response".to_string())),
        }
    }

    /// Compute Pedersen hash from buffer
    pub fn pedersen_hash_buffer(&mut self, input: &[u8], hash_index: u32) -> Result<PedersenHashBufferResponse> {
        let cmd = Command::PedersenHashBuffer(PedersenHashBuffer::new(input.to_vec(), hash_index));

        match self.execute(cmd)? {
            Response::PedersenHashBufferResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected PedersenHashBufferResponse response".to_string())),
        }
    }

    /// Compute Pedersen commitment
    pub fn pedersen_commit(&mut self, inputs: Vec<Vec<u8>>, hash_index: u32) -> Result<PedersenCommitResponse> {
        let cmd = Command::PedersenCommit(PedersenCommit::new(inputs, hash_index));

        match self.execute(cmd)? {
            Response::PedersenCommitResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected PedersenCommitResponse response".to_string())),
        }
    }

    /// Compute Poseidon2 hash
    pub fn poseidon2_hash(&mut self, inputs: Vec<Vec<u8>>) -> Result<Poseidon2HashResponse> {
        let cmd = Command::Poseidon2Hash(Poseidon2Hash::new(inputs));

        match self.execute(cmd)? {
            Response::Poseidon2HashResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected Poseidon2HashResponse response".to_string())),
        }
    }

    /// Shutdown the backend
    pub fn shutdown(&mut self) -> Result<()> {
        let cmd = Command::Shutdown(Shutdown::new());
        let _ = self.execute(cmd)?;
        self.backend.destroy()
    }

    /// Destroy the backend without sending shutdown command
    pub fn destroy(&mut self) -> Result<()> {
        self.backend.destroy()
    }
}

/// Asynchronous Barretenberg API
#[cfg(feature = "async")]
pub struct BarretenbergApi<B: MsgpackBackendAsync> {
    backend: B,
}

#[cfg(feature = "async")]
impl<B: MsgpackBackendAsync> BarretenbergApi<B> {
    /// Create a new asynchronous API instance with the given backend
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    /// Execute a command and get a response
    async fn execute(&mut self, command: Command) -> Result<Response> {
        // Wrap command in array (tuple of arguments)
        let wrapped = vec![command];

        // Serialize to msgpack
        let input_buffer = rmp_serde::to_vec(&wrapped)
            .map_err(|e| BarretenbergError::Serialization(e.to_string()))?;

        // Call backend
        let output_buffer = self.backend.call_async(&input_buffer).await?;

        // Deserialize response
        let response: Response = rmp_serde::from_slice(&output_buffer)
            .map_err(|e| BarretenbergError::Deserialization(e.to_string()))?;

        Ok(response)
    }

    /// Compute Blake2s hash
    pub async fn blake2s(&mut self, data: &[u8]) -> Result<Blake2sResponse> {
        let cmd = Command::Blake2s(Blake2s::new(data.to_vec()));

        match self.execute(cmd).await? {
            Response::Blake2sResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected Blake2sResponse response".to_string())),
        }
    }

    /// Compute Blake2s hash and convert to field element
    pub async fn blake2s_to_field(&mut self, data: &[u8]) -> Result<Blake2sToFieldResponse> {
        let cmd = Command::Blake2sToField(Blake2sToField::new(data.to_vec()));

        match self.execute(cmd).await? {
            Response::Blake2sToFieldResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected Blake2sToFieldResponse response".to_string())),
        }
    }

    /// Compute Pedersen hash
    pub async fn pedersen_hash(&mut self, inputs: Vec<Vec<u8>>, hash_index: u32) -> Result<PedersenHashResponse> {
        let cmd = Command::PedersenHash(PedersenHash::new(inputs, hash_index));

        match self.execute(cmd).await? {
            Response::PedersenHashResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected PedersenHashResponse response".to_string())),
        }
    }

    /// Compute Pedersen hash from buffer
    pub async fn pedersen_hash_buffer(&mut self, input: &[u8], hash_index: u32) -> Result<PedersenHashBufferResponse> {
        let cmd = Command::PedersenHashBuffer(PedersenHashBuffer::new(input.to_vec(), hash_index));

        match self.execute(cmd).await? {
            Response::PedersenHashBufferResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected PedersenHashBufferResponse response".to_string())),
        }
    }

    /// Compute Pedersen commitment
    pub async fn pedersen_commit(&mut self, inputs: Vec<Vec<u8>>, hash_index: u32) -> Result<PedersenCommitResponse> {
        let cmd = Command::PedersenCommit(PedersenCommit::new(inputs, hash_index));

        match self.execute(cmd).await? {
            Response::PedersenCommitResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected PedersenCommitResponse response".to_string())),
        }
    }

    /// Compute Poseidon2 hash
    pub async fn poseidon2_hash(&mut self, inputs: Vec<Vec<u8>>) -> Result<Poseidon2HashResponse> {
        let cmd = Command::Poseidon2Hash(Poseidon2Hash::new(inputs));

        match self.execute(cmd).await? {
            Response::Poseidon2HashResponse(resp) => Ok(resp),
            _ => Err(BarretenbergError::InvalidResponse("Expected Poseidon2HashResponse response".to_string())),
        }
    }

    /// Shutdown the backend
    pub async fn shutdown(&mut self) -> Result<()> {
        let cmd = Command::Shutdown(Shutdown::new());
        let _ = self.execute(cmd).await?;
        self.backend.destroy_async().await
    }

    /// Destroy the backend without sending shutdown command
    pub async fn destroy(&mut self) -> Result<()> {
        self.backend.destroy_async().await
    }
}
