use noir_rs_barretenberg::{
    acir::{
        create_proof, delete, get_solidity_verifier, get_verification_key, init_proving_key,
        init_verification_key, load_verification_key, new_acir_composer,
        serialize_proof_into_fields, serialize_verification_key_into_fields, verify_proof,
        AcirComposerPtr,
    },
    BackendError,
};

pub struct AcirComposer {
    composer_ptr: AcirComposerPtr,
}

impl AcirComposer {
    /// Creates a new ACIR composer.
    /// # Arguments
    /// * `size_hint` - Hint for the size of the composer.
    /// # Returns
    /// * `Result<AcirComposer, AcirComposerError>` - Returns an AcirComposer instance or an AcirComposerError.
    pub fn new(size_hint: &u32) -> Result<Self, AcirComposerError> {
        Ok(new_acir_composer(size_hint).map(|ptr| Self { composer_ptr: ptr })?)
    }

    /// Initializes the proving key for the given composer.
    /// # Arguments
    /// * `constraint_system_buf` - Buffer representing the constraint system.
    /// # Returns
    /// * `Result<(), String>` - Returns an empty result or an AcirComposerError.
    pub fn init_proving_key(&self, constraint_system_buf: &[u8]) -> Result<(), AcirComposerError> {
        Ok(init_proving_key(&self.composer_ptr, constraint_system_buf)?)
    }

    /// Creates a proof using the provided constraint system buffer and witness.
    /// # Arguments
    /// * `constraint_system_buf` - Buffer representing the constraint system.
    /// * `witness` - Buffer representing the witness.
    /// * `is_recursive` - Boolean indicating whether the proof is recursive.
    /// # Returns
    /// * `Result<Vec<u8>, AcirComposerError>` - Returns the created proof or an AcirComposerError.
    pub fn create_proof(
        &self,
        constraint_system_buf: &[u8],
        witness: &[u8],
        is_recursive: bool,
    ) -> Result<Vec<u8>, AcirComposerError> {
        Ok(create_proof(&self.composer_ptr, constraint_system_buf, witness, is_recursive)?)
    }

    /// Loads the verification key into the given composer.
    /// # Arguments
    /// * `verification_key` - Buffer representing the verification key.
    /// # Returns
    /// * `Result<(), AcirComposerError>` - Returns an empty result or an AcirComposerError.
    pub fn load_verification_key(&self, verification_key: &[u8]) -> Result<(), AcirComposerError> {
        Ok(load_verification_key(&self.composer_ptr, verification_key)?)
    }

    /// Initializes the ACIR composer's verification key.
    /// # Returns
    /// * `Result<(), String>` - Returns an empty result or an error message if there's an issue with the initialization.
    pub fn init_verification_key(&self) -> Result<(), BackendError> {
        init_verification_key(&self.composer_ptr)
    }

    /// Retrieves the verification key from the ACIR composer.
    /// # Arguments
    /// * `acir_composer` - Pointer to the ACIR composer.
    /// # Returns
    /// * `Result<Vec<u8>, AcirComposerError>` - Returns the verification key or an AcirComposerError.
    pub fn get_verification_key(&self) -> Result<Vec<u8>, AcirComposerError> {
        Ok(get_verification_key(&self.composer_ptr)?)
    }

    /// Verifies the proof with the ACIR composer.
    /// # Arguments
    /// * `proof` - Buffer representing the proof.
    /// * `is_recursive` - Boolean indicating whether the proof is recursive.
    /// # Returns
    /// * `Result<bool, AcirComposerError>` - Returns `true` if the verification succeeds, `false` otherwise, or an AcirComposerError.
    pub fn verify_proof(
        &self,
        proof: &[u8],
        is_recursive: bool,
    ) -> Result<bool, AcirComposerError> {
        Ok(verify_proof(&self.composer_ptr, proof, is_recursive)?)
    }

    /// Gets the Solidity verifier string representation from the ACIR composer.
    /// # Returns
    /// * `Result<String, AcirComposerError>` - Returns the Solidity verifier string or an AcirComposerError.
    pub fn get_solidity_verifier(&self) -> Result<String, AcirComposerError> {
        Ok(get_solidity_verifier(&self.composer_ptr)?)
    }

    /// Serializes the provided proof into fields.
    /// # Arguments
    /// * `proof` - Buffer representing the proof.
    /// * `num_inner_public_inputs` - Number of inner public inputs.
    /// # Returns
    /// * `Result<Vec<u8>, AcirComposerError>` - Returns the serialized proof or an AcirComposerError.
    pub fn serialize_proof_into_fields(
        &self,
        proof: &[u8],
        num_inner_public_inputs: u32,
    ) -> Result<Vec<u8>, AcirComposerError> {
        Ok(serialize_proof_into_fields(&self.composer_ptr, proof, num_inner_public_inputs)?)
    }

    /// Serializes the verification key into field elements.
    /// # Arguments
    /// * `acir_composer` - Pointer to the ACIR composer.
    /// # Returns
    /// * `Result<(Vec<u8>, Vec<u8>), AcirComposerError>` - Returns serialized verification key and its hash, or an AcirComposerError.
    pub fn serialize_verification_key_into_fields(
        &self,
    ) -> Result<(Vec<u8>, Vec<u8>), AcirComposerError> {
        Ok(serialize_verification_key_into_fields(&self.composer_ptr)?)
    }
}

impl Drop for AcirComposer {
    fn drop(&mut self) {
        if let Err(e) = delete(self.composer_ptr) {
            eprintln!("Error when dropping AcirComposer: {}", e);
        }
    }
}

#[derive(thiserror::Error, Debug)]
pub enum AcirComposerError {
    #[error("BackendError")]
    BackendError(#[from] BackendError),
}
