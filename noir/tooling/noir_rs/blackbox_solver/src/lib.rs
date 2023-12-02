//! This module deals with the execution of the ACVM.
//!
//! The ACVM execution is independent of the proving backend against which the ACIR code is being proven.
//! However, there are a few opcodes that currently lack a Rust implementation, so the C++ implementations
//! included in Aztec Lab's Barretenberg library are used.
//!
//! Since [`acvm`] provides Rust implementations for these opcodes, this module may be deprecated in the future.

use acir::BlackBoxFunc;
use acvm::{BlackBoxFunctionSolver, BlackBoxResolutionError};

use noir_rs_barretenberg::BackendError;

use self::{pedersen::Pedersen, scalar_mul::ScalarMul, schnorr::SchnorrSig};

pub mod barretenberg_structures;
pub mod pedersen;
pub mod scalar_mul;
pub mod schnorr;

#[derive(Debug, thiserror::Error)]
pub(crate) enum RuntimeError {
    #[error("BackendError")]
    BackendError(#[from] BackendError),
    #[error("Value {scalar_as_hex} is not a valid grumpkin scalar")]
    InvalidGrumpkinScalar { scalar_as_hex: String },
    #[error("Limb {limb_as_hex} is not less than 2^128")]
    InvalidGrumpkinScalarLimb { limb_as_hex: String },
}

/// Represents a blackbox opcodes solver for the [`acvm`].
#[derive(Debug)]
pub struct BlackboxSolver {}

impl BlackboxSolver {
    pub fn new() -> Self {
        Self {}
    }
}

impl Default for BlackboxSolver {
    fn default() -> Self {
        Self::new()
    }
}

impl BlackBoxFunctionSolver for BlackboxSolver {
    fn fixed_base_scalar_mul(
        &self,
        low: &acvm::FieldElement,
        high: &acvm::FieldElement,
    ) -> Result<(acvm::FieldElement, acvm::FieldElement), BlackBoxResolutionError> {
        self.fixed_base(low, high).map_err(|err| {
            BlackBoxResolutionError::Failed(BlackBoxFunc::FixedBaseScalarMul, err.to_string())
        })
    }

    fn pedersen_commitment(
        &self,
        inputs: &[acir::FieldElement],
        domain_separator: u32,
    ) -> Result<(acir::FieldElement, acir::FieldElement), BlackBoxResolutionError> {
        self.encrypt(inputs.to_vec(), domain_separator).map_err(|err| {
            BlackBoxResolutionError::Failed(BlackBoxFunc::PedersenCommitment, err.to_string())
        })
    }

    fn pedersen_hash(
        &self,
        inputs: &[acir::FieldElement],
        domain_separator: u32,
    ) -> Result<acir::FieldElement, BlackBoxResolutionError> {
        self.hash(inputs.to_vec(), domain_separator).map_err(|err| {
            BlackBoxResolutionError::Failed(BlackBoxFunc::PedersenHash, err.to_string())
        })
    }

    fn schnorr_verify(
        &self,
        public_key_x: &acvm::FieldElement,
        public_key_y: &acvm::FieldElement,
        signature: &[u8],
        message: &[u8],
    ) -> Result<bool, BlackBoxResolutionError> {
        let pub_key_bytes: Vec<u8> =
            public_key_x.to_be_bytes().iter().copied().chain(public_key_y.to_be_bytes()).collect();

        let pub_key: [u8; 64] = pub_key_bytes.try_into().unwrap();
        let sig_s: [u8; 32] = signature[0..32].try_into().unwrap();
        let sig_e: [u8; 32] = signature[32..64].try_into().unwrap();

        #[allow(deprecated)]
        self.verify_signature(pub_key, sig_s, sig_e, message).map_err(|err| {
            BlackBoxResolutionError::Failed(BlackBoxFunc::SchnorrVerify, err.to_string())
        })
    }
}
