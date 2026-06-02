/// JoltPrecompiles: real BN254 Poseidon2 using Jolt's own ark fork.
///
/// BN254 field arithmetic is native to Jolt's proof system, so Poseidon2
/// over BN254 Fr should be significantly cheaper than on SP1 (where it's
/// emulated over a 31-bit field).
use alloc::vec::Vec;
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField, Zero};
use ark_ec::{AffineRepr, PrimeGroup};

use zkvm_data_types::field::Digest;
use zkvm_data_types::precompiles::Precompiles;

use super::poseidon2;

/// A BN254 field element as a Digest, using Jolt's patched ark-bn254.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize)]
pub struct JoltBn254Digest(#[serde(with = "fr_serde")] pub Fr);

impl Default for JoltBn254Digest {
    fn default() -> Self { Self(Fr::zero()) }
}

impl core::fmt::Debug for JoltBn254Digest {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "JoltBn254(...)")
    }
}

impl Digest for JoltBn254Digest {
    fn zero() -> Self { Self(Fr::zero()) }
    fn is_zero(&self) -> bool { self.0.is_zero() }

    fn to_bytes32(&self) -> [u8; 32] {
        let le = self.0.into_bigint().to_bytes_le();
        let mut be = [0u8; 32];
        for (i, b) in le.iter().enumerate() {
            if i < 32 { be[31 - i] = *b; }
        }
        be
    }

    fn from_bytes32(bytes: &[u8; 32]) -> Self {
        Self(Fr::from_be_bytes_mod_order(bytes))
    }
}

pub struct JoltPrecompiles;

impl Precompiles for JoltPrecompiles {
    type Digest = JoltBn254Digest;

    fn poseidon2_hash(inputs: &[JoltBn254Digest]) -> JoltBn254Digest {
        let fr_inputs: Vec<Fr> = inputs.iter().map(|d| d.0).collect();
        JoltBn254Digest(poseidon2::hash(&fr_inputs))
    }

    fn poseidon2_hash_with_separator(inputs: &[JoltBn254Digest], separator: u32) -> JoltBn254Digest {
        let fr_inputs: Vec<Fr> = inputs.iter().map(|d| d.0).collect();
        JoltBn254Digest(poseidon2::hash_with_separator(&fr_inputs, separator))
    }

    fn poseidon2_compress(left: &JoltBn254Digest, right: &JoltBn254Digest) -> JoltBn254Digest {
        JoltBn254Digest(poseidon2::compress(&left.0, &right.0))
    }

    fn sha256(_data: &[u8]) -> [u8; 32] { [0u8; 32] }

    fn ec_fixed_base_mul(scalar_bytes: &[u8; 32]) -> (JoltBn254Digest, JoltBn254Digest) {
        let scalar = ark_grumpkin::Fr::from_be_bytes_mod_order(scalar_bytes);
        let result = ark_grumpkin::Affine::from(
            ark_grumpkin::Projective::generator() * scalar
        );
        match result.xy() {
            Some((x, y)) => (JoltBn254Digest(x.clone()), JoltBn254Digest(y.clone())),
            None => (JoltBn254Digest::zero(), JoltBn254Digest::zero()),
        }
    }

    fn ec_mul(px: &JoltBn254Digest, py: &JoltBn254Digest, scalar_bytes: &[u8; 32])
        -> (JoltBn254Digest, JoltBn254Digest)
    {
        // ark_grumpkin::Fq == ark_bn254::Fr, so px.0/py.0 are Grumpkin coords
        let point = ark_grumpkin::Affine::new_unchecked(px.0, py.0);
        if !point.is_on_curve() { return (JoltBn254Digest::zero(), JoltBn254Digest::zero()); }
        let scalar = ark_grumpkin::Fr::from_be_bytes_mod_order(scalar_bytes);
        let result = ark_grumpkin::Affine::from(point * scalar);
        match result.xy() {
            Some((x, y)) => (JoltBn254Digest(x.clone()), JoltBn254Digest(y.clone())),
            None => (JoltBn254Digest::zero(), JoltBn254Digest::zero()),
        }
    }

    fn verify_signature(pkx: &JoltBn254Digest, pky: &JoltBn254Digest, sig: &[u8; 64], msg: &[u8]) -> bool {
        let pubkey = ark_grumpkin::Affine::new_unchecked(pkx.0, pky.0);
        if !pubkey.is_on_curve() || pubkey.is_zero() { return false; }

        let mut s_bytes = [0u8; 32];
        let mut e_bytes = [0u8; 32];
        s_bytes.copy_from_slice(&sig[..32]);
        e_bytes.copy_from_slice(&sig[32..64]);

        let s = ark_grumpkin::Fr::from_be_bytes_mod_order(&s_bytes);
        let e_fr = Fr::from_be_bytes_mod_order(&e_bytes);
        if s.is_zero() || e_fr.is_zero() { return false; }

        // e as Grumpkin scalar (different field from BN254 Fr)
        let e_grumpkin = ark_grumpkin::Fr::from_le_bytes_mod_order(
            &e_fr.into_bigint().to_bytes_le()
        );

        // R = s*G + e*pubkey (2 EC scalar muls — the expensive part)
        let r_point = ark_grumpkin::Affine::from(
            ark_grumpkin::Projective::generator() * s
                + ark_grumpkin::Projective::from(pubkey) * e_grumpkin,
        );
        if r_point.is_zero() { return false; }

        // Challenge: e' = Poseidon2(Poseidon2(R.x, pk.x, pk.y), msg_fields...)
        let r_x = match r_point.xy() { Some((x, _)) => x.clone(), None => return false };
        let (pub_x, pub_y) = match pubkey.xy() { Some((x, y)) => (x.clone(), y.clone()), None => return false };

        let inner = poseidon2::hash(&[r_x, pub_x, pub_y]);
        let mut msg_fields = alloc::vec![inner];
        let mut i = 0;
        while i < msg.len() {
            let chunk_len = core::cmp::min(31, msg.len() - i);
            let mut buf = [0u8; 32];
            buf[(32 - chunk_len)..32].copy_from_slice(&msg[i..i + chunk_len]);
            msg_fields.push(Fr::from_be_bytes_mod_order(&buf));
            i += chunk_len;
        }
        let e_computed = poseidon2::hash(&msg_fields);

        e_fr == e_computed
    }

    fn aes128_encrypt(plaintext: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8> {
        poseidon2_sponge_encrypt(plaintext, key, iv)
    }

    fn name() -> &'static str { "jolt-bn254-poseidon2" }
}

/// Poseidon2 sponge encryption (duplex mode, rate=3, t=4).
///
/// Key and IV are each packed into one Fr field element (16 bytes each,
/// well within the ~31-byte field capacity). They are absorbed into the
/// initial state via a permutation, seeding the keystream.
///
/// Plaintext is processed in 31-byte chunks (safe sub-field size).
/// Each chunk is packed into Fr, added to state[0] (XOR-equivalent in the
/// field), then the first 31 bytes of state[0] are emitted as ciphertext.
/// A permutation advances the keystream after each chunk.
fn poseidon2_sponge_encrypt(plaintext: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8> {
    // Build initial state: absorb key and IV
    let key_fr = {
        let mut buf = [0u8; 32];
        buf[16..32].copy_from_slice(key); // 16 bytes → big-endian Fr
        Fr::from_be_bytes_mod_order(&buf)
    };
    let iv_fr = {
        let mut buf = [0u8; 32];
        buf[16..32].copy_from_slice(iv);
        Fr::from_be_bytes_mod_order(&buf)
    };
    let mut state = [key_fr, iv_fr, Fr::zero(), Fr::zero()];
    poseidon2::permutation(&mut state);

    // Encrypt plaintext in 31-byte chunks
    let chunk_size = 31usize;
    let mut ciphertext = Vec::with_capacity(plaintext.len());
    let mut offset = 0;
    while offset < plaintext.len() {
        let end = core::cmp::min(offset + chunk_size, plaintext.len());
        let chunk = &plaintext[offset..end];

        // Pack chunk into Fr (big-endian, leading zeros)
        let mut buf = [0u8; 32];
        buf[(32 - chunk.len())..32].copy_from_slice(chunk);
        let pt_fr = Fr::from_be_bytes_mod_order(&buf);

        // XOR-equivalent: add plaintext into state[0]
        state[0] += pt_fr;

        // Emit ciphertext: extract the same number of bytes from state[0]
        let ct_le = state[0].into_bigint().to_bytes_le();
        for i in 0..chunk.len() {
            ciphertext.push(ct_le[i]);
        }

        // Advance keystream
        poseidon2::permutation(&mut state);
        offset += chunk_size;
    }

    ciphertext
}

mod fr_serde {
    use ark_bn254::Fr;
    use ark_ff::{BigInteger, PrimeField};
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(fr: &Fr, serializer: S) -> Result<S::Ok, S::Error> {
        let le = fr.into_bigint().to_bytes_le();
        let mut be = [0u8; 32];
        for (i, b) in le.iter().enumerate() {
            if i < 32 { be[31 - i] = *b; }
        }
        serializer.serialize_bytes(&be)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Fr, D::Error> {
        let bytes: &[u8] = Deserialize::deserialize(deserializer)?;
        let mut arr = [0u8; 32];
        arr.copy_from_slice(bytes);
        Ok(Fr::from_be_bytes_mod_order(&arr))
    }
}
