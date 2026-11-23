#!/usr/bin/env python3
"""Reference model of the batched blob opening, used to generate and check the test fixtures.

Implements the accumulation in blob/src/abis/blob_accumulator.nr independently of the circuits (its own Poseidon2,
c-kzg for commitments and proofs, py_ecc for the group arithmetic), so the values it prints are a cross-check of the
circuit and not a copy of its output.

  fixtures   Prints, for each test case, the hinted KZG proofs Q_k and the expected D, E and blob commitments hash.
  verify     Checks each case's (D, E) with c-kzg's verify_kzg_proof(D, 0, 0, E), the same check as the L1 point
             evaluation precompile: honest cases must pass, cases with a wrong proof or mismatched blob data must fail.

Requires `pip install ckzg py_ecc` and the Ethereum trusted setup (c-kzg-4844's src/trusted_setup.txt) at
$TRUSTED_SETUP, or ./trusted_setup.txt.
"""
import hashlib
import os
import re
import sys

import ckzg
from py_ecc.bls.point_compression import compress_G1, decompress_G1
from py_ecc.optimized_bls12_381 import G1, Z1, add, multiply, neg, normalize

BN_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617
BLS_R = 0x73EDA753299D7D483339D80809A1D80553BDA402FFFE5BFEFFFFFFFF00000001
FIELDS_PER_BLOB = 4096

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), *[".."] * 6))
CONSTANTS = open(f"{ROOT}/noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr").read()
POSEIDON2_PARAMS = open(f"{ROOT}/barretenberg/cpp/src/barretenberg/crypto/poseidon2/poseidon2_params.hpp").read()


def constant(name):
    return int(re.search(rf"pub global {name}: \w+ = (\w+);", CONSTANTS).group(1), 0)


SEP_CHALLENGE_Z = constant("DOM_SEP__BLOB_CHALLENGE_Z")
SEP_Z_ACC = constant("DOM_SEP__BLOB_Z_ACC")
SEP_HASHED_Y = constant("DOM_SEP__BLOB_HASHED_Y_LIMBS")
SEP_GAMMA_ACC = constant("DOM_SEP__BLOB_GAMMA_ACC")
SEP_GAMMA_FINAL = constant("DOM_SEP__BLOB_GAMMA_FINAL")
SEP_ALPHA_ACC = constant("DOM_SEP__BLOB_ALPHA_ACC")
CHECKPOINT_END_PREFIX = constant("CHECKPOINT_END_PREFIX")

# Poseidon2 over BN254 with t = 4: the first 4 hex values of the params file are the internal matrix diagonal (minus
# one); the round constants follow the 4x4 internal matrix.
_hex = [int(h, 16) for h in re.findall(r'FF\(std::string\("(0x[0-9a-f]+)"\)\)', POSEIDON2_PARAMS)]
INTERNAL_DIAGONAL_MINUS_ONE = _hex[:4]
ROUND_CONSTANTS = [_hex[20 + 4 * i : 24 + 4 * i] for i in range(64)]
TEST_VECTOR = (_hex[20 + 256 : 24 + 256], _hex[24 + 256 : 28 + 256])


def _external(s):
    t0, t1 = s[0] + s[1], s[2] + s[3]
    t2, t3 = 2 * s[1] + t1, 2 * s[3] + t0
    t4, t5 = 4 * t1 + t3, 4 * t0 + t2
    t6, t7 = t3 + t5, t2 + t4
    return [t6 % BN_P, t5 % BN_P, t7 % BN_P, t4 % BN_P]


def poseidon2_permutation(state):
    s = _external(state)
    for r in range(64):
        if r < 4 or r >= 60:
            s = _external([pow((x + c) % BN_P, 5, BN_P) for x, c in zip(s, ROUND_CONSTANTS[r])])
        else:
            s[0] = pow((s[0] + ROUND_CONSTANTS[r][0]) % BN_P, 5, BN_P)
            total = sum(s)
            s = [(x * d + total) % BN_P for x, d in zip(s, INTERNAL_DIAGONAL_MINUS_ONE)]
    return s


assert poseidon2_permutation(TEST_VECTOR[0]) == TEST_VECTOR[1], "Poseidon2 does not match barretenberg's test vector"


def poseidon2(separator, inputs):
    """poseidon2_hash_with_separator: a rate-3 sponge over [separator, ...inputs]."""
    inputs = [separator] + inputs
    state = [0, 0, 0, (len(inputs) << 64) % BN_P]
    for i in range(0, len(inputs), 3):
        for j, x in enumerate(inputs[i : i + 3]):
            state[j] = (state[j] + x) % BN_P
        state = poseidon2_permutation(state)
    return state[0]


def sha256_to_field(data):
    return int.from_bytes(hashlib.sha256(data).digest()[:31], "big")


def compressed(point):
    return compress_G1(point).to_bytes(48, "big")


def compressed_fields(point):
    c = compressed(point)
    return [int.from_bytes(c[:31], "big"), int.from_bytes(c[31:], "big")]


def limbs(v, n):
    return [(v >> (120 * i)) & ((1 << 120) - 1) for i in range(n)]


def blob_bytes(fields):
    assert len(fields) <= FIELDS_PER_BLOB
    return b"".join(f.to_bytes(32, "big") for f in fields + [0] * (FIELDS_PER_BLOB - len(fields)))


class Accumulator:
    """BlobAccumulator: { blob_commitments_hash_acc, alpha_acc, d_acc, e_acc }."""

    def __init__(self):
        self.commitments_hash, self.alpha, self.d, self.e = 0, 0, Z1, Z1

    def is_empty(self):
        return self.commitments_hash == 0 and self.alpha == 0

    def accumulate_checkpoint(self, ts, circuit_blobs, blob_fields_hash=None, z=None, published_blobs=None, proof_sign=1):
        """
        circuit_blobs: the blob fields the circuit evaluates. published_blobs: the blobs the commitments and KZG
        proofs are made from (the same, for an honest prover). Give blob_fields_hash to derive z, or z itself when the
        hash comes from the rollup circuits' sponge. Returns the hinted Q.
        """
        published_blobs = published_blobs or circuit_blobs
        published = [blob_bytes(b) for b in published_blobs]
        commitments = [decompress_G1(int.from_bytes(ckzg.blob_to_kzg_commitment(b, ts), "big")) for b in published]

        derived_z = None
        for i, c in enumerate(commitments):
            first_of_epoch = i == 0 and self.is_empty()
            prefix = b"" if first_of_epoch else self.commitments_hash.to_bytes(32, "big")
            self.commitments_hash = sha256_to_field(prefix + bytes([i == 0]) + compressed(c))
            if blob_fields_hash is not None:
                z_i = poseidon2(SEP_CHALLENGE_Z, [blob_fields_hash] + compressed_fields(c))
                derived_z = z_i if i == 0 else poseidon2(SEP_Z_ACC, [derived_z, z_i])
        z = derived_z if z is None else z
        z_bytes = z.to_bytes(32, "big")

        # y_l is the circuit's evaluation of its own blob fields; the proof is for the published blob.
        ys = [int.from_bytes(ckzg.compute_kzg_proof(blob_bytes(b), z_bytes, ts)[1], "big") for b in circuit_blobs]
        proofs = [decompress_G1(int.from_bytes(ckzg.compute_kzg_proof(b, z_bytes, ts)[0], "big")) for b in published]

        gamma_acc = None
        for y in ys:
            hashed_y = poseidon2(SEP_HASHED_Y, limbs(y, 3))
            gamma_acc = hashed_y if gamma_acc is None else poseidon2(SEP_GAMMA_ACC, [gamma_acc, hashed_y])
        gamma = poseidon2(SEP_GAMMA_FINAL, [gamma_acc, z])

        q, c_k, y_k = Z1, Z1, 0
        for l, (c, y, proof) in enumerate(zip(commitments, ys, proofs)):
            gamma_pow = pow(gamma, l, BLS_R)
            q = add(q, multiply(proof, gamma_pow))
            c_k = add(c_k, multiply(c, gamma_pow))
            y_k = (y_k + gamma_pow * y) % BLS_R
        if proof_sign == -1:
            q = neg(q)

        self.alpha = poseidon2(SEP_ALPHA_ACC, [self.alpha, gamma] + compressed_fields(q))
        claim = add(add(c_k, neg(multiply(G1, y_k))), multiply(q, z))
        self.d = add(self.d, multiply(claim, self.alpha))
        self.e = add(self.e, multiply(q, self.alpha))
        return q, commitments, z


SINGLE_BLOB = [123 + i for i in range(400)]
SINGLE_BLOB_FIELDS_HASH = 0x10E7A5250A2EED72979690733B80804798338DE751531BC3401BE72C94D17FE6
THREE_BLOBS = [456 + i for i in range(FIELDS_PER_BLOB * 2 + 123)]

# The blob fields and z of the checkpoint root rollup tests in rollup-lib (checkpoint_root/tests/blob_tests.nr). Their
# z values come from labs/yarn-project (block_building_helpers.test.ts and blob-lib's blob_batching.test.ts): the
# blob fields hash is computed by the rollup circuits' blob sponge, which this script does not model.
ROLLUP_ONE_BLOB = [
    0x7AFFFFFF85,
    0x7BFFFFFF84,
    0x7CFFFFFF83,
    0x7DFFFFFF82,
    0x7EFFFFFF81,
    0x8C63744300000006,
]
ROLLUP_ONE_BLOB_Z = 0x0A3C46459EB1496FB668371F5A418F65A40C0D35B0AAC56585B37D80024C124A
ROLLUP_SIX_BLOBS = [456 + i for i in range(FIELDS_PER_BLOB * 6 - 1)]
ROLLUP_SIX_BLOBS.append((CHECKPOINT_END_PREFIX << 32) + FIELDS_PER_BLOB * 6)
ROLLUP_SIX_BLOBS_Z = 0x2FB9C6809D9B09D4726ECA4C5DD25B155A0FC73C69A416E8403774E63A1B39DD


def split(fields):
    return [fields[i : i + FIELDS_PER_BLOB] for i in range(0, len(fields), FIELDS_PER_BLOB)]


def cases(ts):
    """Yields (name, should_verify, accumulator, [(Q, commitments, z)]) for every test case."""
    acc = Accumulator()
    yield "single_blob", True, acc, [acc.accumulate_checkpoint(ts, [SINGLE_BLOB], SINGLE_BLOB_FIELDS_HASH)]

    # A checkpoint with blobs [C_0, C_1] followed by a checkpoint with [C_2].
    acc = Accumulator()
    blobs = split(THREE_BLOBS)
    steps = [acc.accumulate_checkpoint(ts, blobs[:2], 0x1111), acc.accumulate_checkpoint(ts, blobs[2:], 0x2222)]
    yield "two_checkpoints", True, acc, steps

    # The honest proof negated.
    acc = Accumulator()
    steps = [acc.accumulate_checkpoint(ts, [SINGLE_BLOB], SINGLE_BLOB_FIELDS_HASH, proof_sign=-1)]
    yield "wrong_proof", False, acc, steps

    # The circuit's blob fields differ in one field from the blob that was published and proven.
    acc = Accumulator()
    published = [SINGLE_BLOB[:399] + [SINGLE_BLOB[399] + 1]]
    steps = [acc.accumulate_checkpoint(ts, [SINGLE_BLOB], SINGLE_BLOB_FIELDS_HASH, published_blobs=published)]
    yield "mismatched_blob", False, acc, steps

    acc = Accumulator()
    yield "rollup_one_blob", True, acc, [acc.accumulate_checkpoint(ts, [ROLLUP_ONE_BLOB], z=ROLLUP_ONE_BLOB_Z)]

    acc = Accumulator()
    steps = [acc.accumulate_checkpoint(ts, split(ROLLUP_SIX_BLOBS), z=ROLLUP_SIX_BLOBS_Z)]
    yield "rollup_six_blobs", True, acc, steps


def hex_limbs(point):
    x, y = normalize(point)
    fmt = lambda v: "[" + ", ".join(f"0x{l:0{30 if i < 3 else 6}x}" for i, l in enumerate(limbs(int(v), 4))) + "]"
    return f"x {fmt(x)} y {fmt(y)}"


def hex_fields(point):
    return "[" + ", ".join(f"0x{f:x}" for f in compressed_fields(point)) + "]"


def main():
    ts = ckzg.load_trusted_setup(os.environ.get("TRUSTED_SETUP", "trusted_setup.txt"), 0)
    mode = sys.argv[1]
    ok = True
    for name, should_verify, acc, steps in cases(ts):
        d, e = compressed(acc.d), compressed(acc.e)
        if mode == "fixtures":
            print(f"== {name}")
            for k, (q, commitments, z) in enumerate(steps):
                print(f"  checkpoint {k}: z 0x{z:064x}")
                for l, c in enumerate(commitments):
                    print(f"    C_{l} limbs {hex_limbs(c)}")
                print(f"    Q limbs {hex_limbs(q)}" if q != Z1 else "    Q is the point at infinity")
            print(f"  blob_commitments_hash 0x{acc.commitments_hash:064x}")
            print(f"  D fields {hex_fields(acc.d)} bytes {d.hex()}")
            print(f"  E fields {hex_fields(acc.e)} bytes {e.hex()}")
        elif mode == "verify":
            verified = ckzg.verify_kzg_proof(d, bytes(32), bytes(32), e, ts)
            print(f"{name}: pairing check {'passes' if verified else 'fails'}, expected to {'pass' if should_verify else 'fail'}")
            ok &= verified == should_verify
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
