use crate::{opcodes::HeapVector, HeapArray, MemoryAddress};
use serde::{Deserialize, Serialize};

/// These opcodes provide an equivalent of ACIR blackbox functions.
/// They are implemented as native functions in the VM.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Hash)]
pub enum BlackBoxOp {
    /// Encrypts a message using AES128.
    AES128Encrypt {
        inputs: HeapVector,
        iv: HeapArray,
        key: HeapArray,
        outputs: HeapVector,
    },
    /// Calculates the Blake2s hash of the inputs.
    Blake2s {
        message: HeapVector,
        output: HeapArray,
    },
    /// Calculates the Blake3 hash of the inputs.
    Blake3 {
        message: HeapVector,
        output: HeapArray,
    },
    /// Keccak Permutation function of 1600 width
    Keccakf1600 {
        input: HeapArray,
        output: HeapArray,
    },
    /// Verifies a ECDSA signature over the secp256k1 curve.
    EcdsaSecp256k1 {
        hashed_msg: HeapVector,
        public_key_x: HeapArray,
        public_key_y: HeapArray,
        signature: HeapArray,
        result: MemoryAddress,
    },
    /// Verifies a ECDSA signature over the secp256r1 curve.
    EcdsaSecp256r1 {
        hashed_msg: HeapVector,
        public_key_x: HeapArray,
        public_key_y: HeapArray,
        signature: HeapArray,
        result: MemoryAddress,
    },

    /// Performs multi scalar multiplication over the embedded curve.
    MultiScalarMul {
        points: HeapVector,
        scalars: HeapVector,
        outputs: HeapArray,
    },
    /// Performs addition over the embedded curve.
    EmbeddedCurveAdd {
        input1_x: MemoryAddress,
        input1_y: MemoryAddress,
        input1_infinite: MemoryAddress,
        input2_x: MemoryAddress,
        input2_y: MemoryAddress,
        input2_infinite: MemoryAddress,
        result: HeapArray,
    },
    BigIntAdd {
        lhs: MemoryAddress,
        rhs: MemoryAddress,
        output: MemoryAddress,
    },
    BigIntSub {
        lhs: MemoryAddress,
        rhs: MemoryAddress,
        output: MemoryAddress,
    },
    BigIntMul {
        lhs: MemoryAddress,
        rhs: MemoryAddress,
        output: MemoryAddress,
    },
    BigIntDiv {
        lhs: MemoryAddress,
        rhs: MemoryAddress,
        output: MemoryAddress,
    },
    BigIntFromLeBytes {
        inputs: HeapVector,
        modulus: HeapVector,
        output: MemoryAddress,
    },
    BigIntToLeBytes {
        input: MemoryAddress,
        output: HeapVector,
    },
    Poseidon2Permutation {
        message: HeapVector,
        output: HeapArray,
        len: MemoryAddress,
    },
    Sha256Compression {
        input: HeapArray,
        hash_values: HeapArray,
        output: HeapArray,
    },
    ToRadix {
        input: MemoryAddress,
        radix: MemoryAddress,
        output_pointer: MemoryAddress,
        num_limbs: MemoryAddress,
        output_bits: MemoryAddress,
    },
}

/// Enum listing Brillig black box functions. There is one-to-one correspondence with the previous enum BlackBoxOp.
#[allow(clippy::upper_case_acronyms)]
#[derive(Clone, Debug, Hash, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BrilligBlackBoxFunc {
    /// Ciphers (encrypts) the provided plaintext using AES128 in CBC mode,
    /// padding the input using PKCS#7.
    /// - inputs: byte array `[u8; N]`
    /// - iv: initialization vector `[u8; 16]`
    /// - key: user key `[u8; 16]`
    /// - outputs: byte vector `[u8]` of length `input.len() + (16 - input.len() % 16)`
    AES128Encrypt,

    /// Computes the Blake2s hash of the inputs, as specified in
    /// https://tools.ietf.org/html/rfc7693
    /// - inputs are a byte array, i.e a vector of (witness, 8)
    /// - output is a byte array of length 32, i.e. an array of 32
    ///   (witness, 8), constrained to be the blake2s of the inputs.
    Blake2s,

    /// Computes the Blake3 hash of the inputs
    /// - inputs are a byte array, i.e a vector of (witness, 8)
    /// - output is a byte array of length 32, i.e an array of 32
    ///   (witness, 8), constrained to be the blake3 of the inputs.
    Blake3,

    /// Keccak Permutation function of width 1600
    /// - inputs: An array of 25 64-bit Keccak lanes that represent a keccak sponge of 1600 bits
    /// - outputs: The result of a keccak f1600 permutation on the input state. Also an array of 25 Keccak lanes.
    Keccakf1600,

    /// Verifies a ECDSA signature over the secp256k1 curve.
    /// - inputs:
    ///     - x coordinate of public key as 32 bytes
    ///     - y coordinate of public key as 32 bytes
    ///     - the signature, as a 64 bytes array
    ///     - the hash of the message, as a vector of bytes
    /// - output: 0 for failure and 1 for success
    EcdsaSecp256k1,

    /// Verifies a ECDSA signature over the secp256r1 curve.
    ///
    /// Same as EcdsaSecp256k1, but done over another curve.
    EcdsaSecp256r1,

    /// Multiple scalar multiplication (MSM) with a variable base/input point
    /// (P) of the embedded curve. An MSM multiplies the points and scalars and
    /// sums the results.
    /// - input:
    ///     points (witness, N) a vector of x and y coordinates of input
    ///     points `[x1, y1, x2, y2,...]`.
    ///     scalars (witness, N) a vector of low and high limbs of input
    ///     scalars `[s1_low, s1_high, s2_low, s2_high, ...]`. (witness, N)
    ///     For Barretenberg, they must both be less than 128 bits.
    /// - output:
    ///     a tuple of `x` and `y` coordinates of output.
    ///     Points computed as `s_low*P+s_high*2^{128}*P`
    ///
    /// Because the Grumpkin scalar field is bigger than the ACIR field, we
    /// provide 2 ACIR fields representing the low and high parts of the Grumpkin
    /// scalar $a$: `a=low+high*2^{128}`, with `low, high < 2^{128}`
    MultiScalarMul,

    /// Addition over the embedded curve on which the witness is defined
    /// The opcode makes the following assumptions but does not enforce them because
    /// it is more efficient to do it only when required. For instance, adding two
    /// points that are on the curve it guarantee to give a point on the curve.
    ///
    /// It assumes that the points are on the curve.
    /// If the inputs are the same witnesses index, it will perform a doubling,
    /// If not, it assumes that the points' x-coordinates are not equal.
    /// It also assumes neither point is the infinity point.
    EmbeddedCurveAdd,

    /// BigInt addition
    BigIntAdd,

    /// BigInt subtraction
    BigIntSub,

    /// BigInt multiplication
    BigIntMul,

    /// BigInt division
    BigIntDiv,

    /// BigInt from le bytes
    BigIntFromLeBytes,

    /// BigInt to le bytes
    BigIntToLeBytes,

    /// Permutation function of Poseidon2
    Poseidon2Permutation,

    /// SHA256 compression function
    /// - input: [(witness, 32); 16]
    /// - state: [(witness, 32); 8]
    /// - output: [(witness, 32); 8]
    Sha256Compression,

    /// Big-endian radix decomposition
    ToRadix,
}

impl std::fmt::Display for BrilligBlackBoxFunc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.name())
    }
}

impl From<BlackBoxOp> for BrilligBlackBoxFunc {
    fn from(op: BlackBoxOp) -> Self {
        match op {
            BlackBoxOp::AES128Encrypt { .. } => BrilligBlackBoxFunc::AES128Encrypt,
            BlackBoxOp::Blake2s { .. } => BrilligBlackBoxFunc::Blake2s,
            BlackBoxOp::Blake3 { .. } => BrilligBlackBoxFunc::Blake3,
            BlackBoxOp::Keccakf1600 { .. } => BrilligBlackBoxFunc::Keccakf1600,
            BlackBoxOp::EcdsaSecp256k1 { .. } => BrilligBlackBoxFunc::EcdsaSecp256k1,
            BlackBoxOp::EcdsaSecp256r1 { .. } => BrilligBlackBoxFunc::EcdsaSecp256r1,
            BlackBoxOp::MultiScalarMul { .. } => BrilligBlackBoxFunc::MultiScalarMul,
            BlackBoxOp::EmbeddedCurveAdd { .. } => BrilligBlackBoxFunc::EmbeddedCurveAdd,
            BlackBoxOp::BigIntAdd { .. } => BrilligBlackBoxFunc::BigIntAdd,
            BlackBoxOp::BigIntSub { .. } => BrilligBlackBoxFunc::BigIntSub,
            BlackBoxOp::BigIntMul { .. } => BrilligBlackBoxFunc::BigIntMul,
            BlackBoxOp::BigIntDiv { .. } => BrilligBlackBoxFunc::BigIntDiv,
            BlackBoxOp::BigIntFromLeBytes { .. } => BrilligBlackBoxFunc::BigIntFromLeBytes,
            BlackBoxOp::BigIntToLeBytes { .. } => BrilligBlackBoxFunc::BigIntToLeBytes,
            BlackBoxOp::Poseidon2Permutation { .. } => BrilligBlackBoxFunc::Poseidon2Permutation,
            BlackBoxOp::Sha256Compression { .. } => BrilligBlackBoxFunc::Sha256Compression,
            BlackBoxOp::ToRadix { .. } => BrilligBlackBoxFunc::ToRadix,
        }
    }
}

impl BrilligBlackBoxFunc {
    pub fn name(&self) -> &'static str {
        match self {
            BrilligBlackBoxFunc::AES128Encrypt => "aes128_encrypt",
            BrilligBlackBoxFunc::Blake2s => "blake2s",
            BrilligBlackBoxFunc::Blake3 => "blake3",
            BrilligBlackBoxFunc::EcdsaSecp256k1 => "ecdsa_secp256k1",
            BrilligBlackBoxFunc::MultiScalarMul => "multi_scalar_mul",
            BrilligBlackBoxFunc::EmbeddedCurveAdd => "embedded_curve_add",
            BrilligBlackBoxFunc::Keccakf1600 => "keccakf1600",
            BrilligBlackBoxFunc::EcdsaSecp256r1 => "ecdsa_secp256r1",
            BrilligBlackBoxFunc::BigIntAdd => "bigint_add",
            BrilligBlackBoxFunc::BigIntSub => "bigint_sub",
            BrilligBlackBoxFunc::BigIntMul => "bigint_mul",
            BrilligBlackBoxFunc::BigIntDiv => "bigint_div",
            BrilligBlackBoxFunc::BigIntFromLeBytes => "bigint_from_le_bytes",
            BrilligBlackBoxFunc::BigIntToLeBytes => "bigint_to_le_bytes",
            BrilligBlackBoxFunc::Poseidon2Permutation => "poseidon2_permutation",
            BrilligBlackBoxFunc::Sha256Compression => "sha256_compression",
            BrilligBlackBoxFunc::ToRadix => "to_radix",
        }
    }
}
