/// Poseidon2 hash over BN254 scalar field.
///
/// Ported from noir/noir-repo/acvm-repo/bn254_blackbox_solver/src/poseidon2.rs.
/// Parameters: t=4 (state width), rounds_f=8 (full rounds), rounds_p=56 (partial rounds).
/// S-box: x^5.
///
/// This implementation is no_std compatible and uses ark_bn254::Fr directly.
use ark_bn254::Fr;
use ark_ff::{Field, One, Zero};

use crate::poseidon2_params;

const T: usize = 4;
const ROUNDS_F: usize = 8;
const ROUNDS_P: usize = 56;

/// Poseidon2 permutation: apply the full permutation to a 4-element state.
pub fn permutation(state: &mut [Fr; T]) {
    let params = poseidon2_params::params();
    let rc = &params.round_constants;
    let diag = &params.internal_matrix_diagonal;

    // Initial linear layer
    matrix_mul_4x4(state);

    // First half of full rounds
    let rf_first = ROUNDS_F / 2;
    for r in 0..rf_first {
        add_round_constants(state, &rc[r]);
        s_box_full(state);
        matrix_mul_4x4(state);
    }

    // Partial rounds
    for r in rf_first..(rf_first + ROUNDS_P) {
        state[0] += rc[r][0];
        state[0] = s_box_single(state[0]);
        internal_m_mul(state, diag);
    }

    // Second half of full rounds
    for r in (rf_first + ROUNDS_P)..(ROUNDS_F + ROUNDS_P) {
        add_round_constants(state, &rc[r]);
        s_box_full(state);
        matrix_mul_4x4(state);
    }
}

/// Poseidon2 sponge hash: absorb inputs (rate 3, capacity 1), squeeze 1 output.
///
/// IV encodes the input length: state[3] = len * 2^64.
/// Absorb: chunks of 3 elements, add to state[0..3], then permute.
/// Squeeze: output state[0].
pub fn hash(inputs: &[Fr]) -> Fr {
    let mut state = [Fr::zero(); T];

    // IV: encode length in high bits of last state element
    // len * 2^64 in the field
    let two_pow_64 = Fr::from(1u64 << 32) * Fr::from(1u64 << 32);
    state[T - 1] = Fr::from(inputs.len() as u64) * two_pow_64;

    // Absorb in chunks of 3 (rate = t - 1 = 3)
    let rate = T - 1;
    let mut offset = 0;
    while offset < inputs.len() {
        let chunk_size = core::cmp::min(rate, inputs.len() - offset);
        for i in 0..chunk_size {
            state[i] += inputs[offset + i];
        }
        permutation(&mut state);
        offset += rate;
    }

    // Squeeze
    state[0]
}

/// Hash with a domain separator prepended.
pub fn hash_with_separator(inputs: &[Fr], separator: u32) -> Fr {
    let mut all = alloc::vec::Vec::with_capacity(inputs.len() + 1);
    all.push(Fr::from(separator as u64));
    all.extend_from_slice(inputs);
    hash(&all)
}

/// Two-to-one compression for Merkle trees.
/// Compresses two field elements into one via permutation.
pub fn compress(left: &Fr, right: &Fr) -> Fr {
    let mut state = [*left, *right, Fr::zero(), Fr::zero()];
    // IV for 2 inputs
    let two_pow_64 = Fr::from(1u64 << 32) * Fr::from(1u64 << 32);
    state[T - 1] = Fr::from(2u64) * two_pow_64;
    permutation(&mut state);
    state[0]
}

// --- Internal functions ---

#[inline]
fn s_box_single(x: Fr) -> Fr {
    let x2 = x * x;
    x2 * x2 * x // x^5
}

fn s_box_full(state: &mut [Fr; T]) {
    for s in state.iter_mut() {
        *s = s_box_single(*s);
    }
}

fn add_round_constants(state: &mut [Fr; T], constants: &[Fr; 4]) {
    for (s, c) in state.iter_mut().zip(constants.iter()) {
        *s += c;
    }
}

/// 4x4 MDS matrix multiplication.
/// Algorithm from Barretenberg's Poseidon2 implementation.
fn matrix_mul_4x4(state: &mut [Fr; T]) {
    let t0 = state[0] + state[1]; // A + B
    let t1 = state[2] + state[3]; // C + D
    let mut t2 = state[1] + state[1]; // 2B
    t2 += t1; // 2B + C + D
    let mut t3 = state[3] + state[3]; // 2D
    t3 += t0; // 2D + A + B
    let mut t4 = t1 + t1;
    t4 += t4;
    t4 += t3; // A + B + 4C + 6D
    let mut t5 = t0 + t0;
    t5 += t5;
    t5 += t2; // 4A + 6B + C + D
    let t6 = t3 + t5; // 5A + 7B + C + 3D
    let t7 = t2 + t4; // A + 3B + 5C + 7D
    state[0] = t6;
    state[1] = t5;
    state[2] = t7;
    state[3] = t4;
}

/// Internal matrix multiplication for partial rounds.
fn internal_m_mul(state: &mut [Fr; T], diag: &[Fr; 4]) {
    let mut sum = Fr::zero();
    for s in state.iter() {
        sum += s;
    }
    for (i, s) in state.iter_mut().enumerate() {
        *s *= diag[i];
        *s += sum;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_ff::PrimeField;

    fn fr_from_hex(hex: &str) -> Fr {
        Fr::from_be_bytes_mod_order(&hex::decode(hex).unwrap())
    }

    #[test]
    fn permutation_smoke_test() {
        // Test vector from the original implementation
        let mut state = [Fr::zero(); 4];
        permutation(&mut state);

        let expected = [
            fr_from_hex("18DFB8DC9B82229CFF974EFEFC8DF78B1CE96D9D844236B496785C698BC6732E"),
            fr_from_hex("095C230D1D37A246E8D2D5A63B165FE0FADE040D442F61E25F0590E5FB76F839"),
            fr_from_hex("0BB9545846E1AFA4FA3C97414A60A20FC4949F537A68CCECA34C5CE71E28AA59"),
            fr_from_hex("18A4F34C9C6F99335FF7638B82AEED9018026618358873C982BBDDE265B2ED6D"),
        ];
        assert_eq!(state, expected);
    }

    #[test]
    fn hash_single_element() {
        let result = hash(&[Fr::from(1u64)]);
        // Should produce a non-zero, deterministic output
        assert_ne!(result, Fr::zero());
    }

    #[test]
    fn hash_is_deterministic() {
        let a = hash(&[Fr::from(42u64), Fr::from(99u64)]);
        let b = hash(&[Fr::from(42u64), Fr::from(99u64)]);
        assert_eq!(a, b);
    }

    #[test]
    fn hash_different_inputs_different_outputs() {
        let a = hash(&[Fr::from(1u64)]);
        let b = hash(&[Fr::from(2u64)]);
        assert_ne!(a, b);
    }

    #[test]
    fn hash_with_separator_differs_from_plain() {
        let inputs = [Fr::from(1u64), Fr::from(2u64)];
        let plain = hash(&inputs);
        let separated = hash_with_separator(&inputs, 42);
        assert_ne!(plain, separated);
    }
}
