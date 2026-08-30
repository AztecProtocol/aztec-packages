//! Back-compat shim mirroring the pre-codegen `BarretenbergApi` surface.
//!
//! The codegen migration replaced loose `&[u8]` / `Vec<Vec<u8>>` scalar
//! parameters with typed newtypes (`Fr`, `Fq`, `Secp256k1Fr`, ...). External
//! consumers were already depending on the old surface, so this shim
//! preserves it: callers that did
//!
//! ```ignore
//! use barretenberg_rs::{BarretenbergApi, FfiBackend};
//! let mut api = BarretenbergApi::new(FfiBackend::new()?);
//! api.schnorr_compute_public_key(&private_key_bytes)?;
//! ```
//!
//! continue to compile against this crate while they migrate to the new
//! [`crate::BbApi`] surface (typed scalars, `Vec<Fr>` for hash inputs,
//! etc.).
//!
//! Wire format is identical — only the Rust call surface changed. Methods
//! whose signature did not change reach `BbApi` through `Deref` (no
//! explicit wrapper here).

#![allow(deprecated)]

use std::ops::{Deref, DerefMut};

use crate::generated::backend::Backend;
use crate::generated::bb_client::BbApi;
use crate::generated::bb_types::{
    AesDecryptResponse,
    AesEncryptResponse,
    Bn254FqSqrtResponse,
    Bn254FrSqrtResponse,
    Bn254G1MulResponse,
    Bn254G2MulResponse,
    EcdsaSecp256k1ComputePublicKeyResponse,
    EcdsaSecp256k1ConstructSignatureResponse,
    EcdsaSecp256r1ComputePublicKeyResponse,
    EcdsaSecp256r1ConstructSignatureResponse,
    Fq,
    Fr,
    GrumpkinAddResponse,
    GrumpkinBatchMulResponse,
    GrumpkinMulResponse,
    PedersenCommitResponse,
    PedersenHashResponse,
    Poseidon2HashResponse,
    Poseidon2PermutationResponse,
    EcdsaSecp256k1VerifySignatureResponse,
    SchnorrComputePublicKeyResponse,
    SchnorrConstructSignatureResponse,
    SchnorrVerifySignatureResponse,
    Secp256k1Fr,
    Secp256k1MulResponse,
    Secp256r1Fr,
};
use crate::generated::bb_types as wire;
use crate::generated::error::Result;
#[allow(deprecated)]
use crate::legacy_types::{Bn254G1Point, Bn254G2Point, GrumpkinPoint, Secp256k1Point};

/// Deprecated alias for [`crate::BbApi`] preserving the pre-migration call
/// surface (`&[u8]` scalars, `Vec<Vec<u8>>` hash inputs). Forwards unchanged
/// methods to `BbApi` via `Deref`; overrides methods whose signature changed.
#[deprecated(
    note = "use `BbApi` directly; typed scalars (Fr/Fq/Secp256k1Fr) replace raw `&[u8]` parameters"
)]
pub struct BarretenbergApi<B: Backend>(BbApi<B>);

impl<B: Backend> BarretenbergApi<B> {
    pub fn new(backend: B) -> Self {
        Self(BbApi::new(backend))
    }

    pub fn into_inner(self) -> BbApi<B> {
        self.0
    }
}

impl<B: Backend> Deref for BarretenbergApi<B> {
    type Target = BbApi<B>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<B: Backend> DerefMut for BarretenbergApi<B> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

fn to_fr_array(s: &[u8]) -> Fr {
    let arr: [u8; 32] = s.try_into().expect("expected 32-byte scalar");
    Fr::from_be_bytes(arr)
}

fn to_fq_array(s: &[u8]) -> Fq {
    let arr: [u8; 32] = s.try_into().expect("expected 32-byte scalar");
    Fq::from_bytes(arr)
}

fn to_secp256k1_fr(s: &[u8]) -> Secp256k1Fr {
    let arr: [u8; 32] = s.try_into().expect("expected 32-byte secp256k1 scalar");
    Secp256k1Fr::from_bytes(arr)
}

fn to_secp256r1_fr(s: &[u8]) -> Secp256r1Fr {
    let arr: [u8; 32] = s.try_into().expect("expected 32-byte secp256r1 scalar");
    Secp256r1Fr::from_bytes(arr)
}

fn to_16_array(s: &[u8]) -> [u8; 16] {
    s.try_into().expect("expected 16-byte value")
}

fn to_32_array(s: &[u8]) -> [u8; 32] {
    s.try_into().expect("expected 32-byte value")
}

fn fr_vec(inputs: Vec<Vec<u8>>) -> Vec<Fr> {
    inputs.into_iter().map(|b| to_fr_array(&b)).collect()
}

// Old-surface methods. These shadow the same-named methods reached through
// `Deref`, so callers picking up `BarretenbergApi` get the legacy signature.
#[allow(deprecated)]
impl<B: Backend> BarretenbergApi<B> {
    pub fn poseidon2_hash(&mut self, inputs: Vec<Vec<u8>>) -> Result<Poseidon2HashResponse> {
        self.0.poseidon2_hash(fr_vec(inputs))
    }

    pub fn poseidon2_permutation(
        &mut self,
        inputs: [Vec<u8>; 4],
    ) -> Result<Poseidon2PermutationResponse> {
        let typed: [Fr; 4] = inputs.map(|b| to_fr_array(&b));
        self.0.poseidon2_permutation(typed)
    }

    pub fn pedersen_commit(
        &mut self,
        inputs: Vec<Vec<u8>>,
        hash_index: u32,
    ) -> Result<PedersenCommitResponse> {
        self.0.pedersen_commit(fr_vec(inputs), hash_index)
    }

    pub fn pedersen_hash(
        &mut self,
        inputs: Vec<Vec<u8>>,
        hash_index: u32,
    ) -> Result<PedersenHashResponse> {
        self.0.pedersen_hash(fr_vec(inputs), hash_index)
    }

    pub fn grumpkin_mul(
        &mut self,
        point: impl Into<wire::GrumpkinPoint>,
        scalar: &[u8],
    ) -> Result<GrumpkinMulResponse> {
        self.0.grumpkin_mul(point.into(), to_fq_array(scalar))
    }

    pub fn grumpkin_add(
        &mut self,
        a: impl Into<wire::GrumpkinPoint>,
        b: impl Into<wire::GrumpkinPoint>,
    ) -> Result<GrumpkinAddResponse> {
        self.0.grumpkin_add(a.into(), b.into())
    }

    pub fn grumpkin_batch_mul(
        &mut self,
        points: Vec<impl Into<wire::GrumpkinPoint>>,
        scalar: &[u8],
    ) -> Result<GrumpkinBatchMulResponse> {
        self.0.grumpkin_batch_mul(points.into_iter().map(Into::into).collect(), to_fq_array(scalar))
    }

    pub fn secp256k1_mul(
        &mut self,
        point: impl Into<wire::Secp256k1Point>,
        scalar: &[u8],
    ) -> Result<Secp256k1MulResponse> {
        self.0.secp256k1_mul(point.into(), to_secp256k1_fr(scalar))
    }

    pub fn bn254_fr_sqrt(&mut self, input: &[u8]) -> Result<Bn254FrSqrtResponse> {
        self.0.bn254_fr_sqrt(to_fr_array(input))
    }

    pub fn bn254_fq_sqrt(&mut self, input: &[u8]) -> Result<Bn254FqSqrtResponse> {
        self.0.bn254_fq_sqrt(to_fq_array(input))
    }

    pub fn bn254_g1_mul(
        &mut self,
        point: impl Into<wire::Bn254G1Point>,
        scalar: &[u8],
    ) -> Result<Bn254G1MulResponse> {
        self.0.bn254_g1_mul(point.into(), to_fr_array(scalar))
    }

    pub fn bn254_g2_mul(
        &mut self,
        point: impl Into<wire::Bn254G2Point>,
        scalar: &[u8],
    ) -> Result<Bn254G2MulResponse> {
        self.0.bn254_g2_mul(point.into(), to_fr_array(scalar))
    }

    pub fn schnorr_compute_public_key(
        &mut self,
        private_key: &[u8],
    ) -> Result<crate::legacy_types::SchnorrComputePublicKeyResponse> {
        Ok(self.0.schnorr_compute_public_key(to_fq_array(private_key))?.into())
    }

    pub fn schnorr_construct_signature(
        &mut self,
        message: &[u8],
        private_key: &[u8],
    ) -> Result<SchnorrConstructSignatureResponse> {
        self.0
            .schnorr_construct_signature(to_fr_array(message), to_fq_array(private_key))
    }

    pub fn ecdsa_secp256k1_compute_public_key(
        &mut self,
        private_key: &[u8],
    ) -> Result<crate::legacy_types::EcdsaSecp256k1ComputePublicKeyResponse> {
        Ok(self
            .0
            .ecdsa_secp256k1_compute_public_key(to_secp256k1_fr(private_key))?
            .into())
    }

    pub fn ecdsa_secp256r1_compute_public_key(
        &mut self,
        private_key: &[u8],
    ) -> Result<crate::legacy_types::EcdsaSecp256r1ComputePublicKeyResponse> {
        Ok(self
            .0
            .ecdsa_secp256r1_compute_public_key(to_secp256r1_fr(private_key))?
            .into())
    }

    pub fn ecdsa_secp256k1_construct_signature(
        &mut self,
        message: &[u8],
        private_key: &[u8],
    ) -> Result<EcdsaSecp256k1ConstructSignatureResponse> {
        self.0
            .ecdsa_secp256k1_construct_signature(message, to_secp256k1_fr(private_key))
    }

    pub fn ecdsa_secp256r1_construct_signature(
        &mut self,
        message: &[u8],
        private_key: &[u8],
    ) -> Result<EcdsaSecp256r1ConstructSignatureResponse> {
        self.0
            .ecdsa_secp256r1_construct_signature(message, to_secp256r1_fr(private_key))
    }
    pub fn aes_encrypt(
        &mut self,
        plaintext: &[u8],
        iv: &[u8],
        key: &[u8],
        length: u32,
    ) -> Result<AesEncryptResponse> {
        self.0
            .aes_encrypt(plaintext, to_16_array(iv), to_16_array(key), length)
    }

    pub fn aes_decrypt(
        &mut self,
        ciphertext: &[u8],
        iv: &[u8],
        key: &[u8],
        length: u32,
    ) -> Result<AesDecryptResponse> {
        self.0
            .aes_decrypt(ciphertext, to_16_array(iv), to_16_array(key), length)
    }

    pub fn schnorr_verify_signature(
        &mut self,
        message: &[u8],
        public_key: impl Into<wire::GrumpkinPoint>,
        s: &[u8],
        e: &[u8],
    ) -> Result<SchnorrVerifySignatureResponse> {
        self.0.schnorr_verify_signature(
            to_fr_array(message),
            public_key.into(),
            to_fq_array(s),
            to_fq_array(e),
        )
    }

    pub fn ecdsa_secp256k1_verify_signature(
        &mut self,
        message: &[u8],
        public_key: impl Into<wire::Secp256k1Point>,
        r: &[u8],
        s: &[u8],
        v: u8,
    ) -> Result<EcdsaSecp256k1VerifySignatureResponse> {
        self.0.ecdsa_secp256k1_verify_signature(
            message,
            public_key.into(),
            to_32_array(r),
            to_32_array(s),
            v,
        )
    }

}
