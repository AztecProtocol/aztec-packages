#!/usr/bin/env python3
"""Fixtures and an independent pairing check for the batched blob opening tests in src/blob_batching.nr.

  proofs              Prints each test checkpoint's KZG proof Q_k = sum_l gamma_k^l * proof(blob_(k,l), z_k), using the
                      z_k and gamma_k the circuit derives, as `from_limbs` arguments.
  verify [<D> <E> ...] Checks e(D, [1]) == e(E, [s]) with c-kzg's verify_kzg_proof(D, 0, 0, E), the same check as the
                      L1 point evaluation precompile. D and E are 48-byte compressed points in hex, as pairs. With no
                      arguments, checks the expected D and E of the tests.

Requires `pip install ckzg py_ecc` and the Ethereum trusted setup (c-kzg-4844's src/trusted_setup.txt) at
$TRUSTED_SETUP, or ./trusted_setup.txt.
"""
import os
import sys

import ckzg
from py_ecc.bls.point_compression import compress_G1, decompress_G1
from py_ecc.optimized_bls12_381 import add, multiply, normalize, Z1

FIELDS_PER_BLOB = 4096
BLS_R = 0x73EDA753299D7D483339D80809A1D80553BDA402FFFE5BFEFFFFFFFF00000001


def blob_bytes(fields):
    fields = fields + [0] * (FIELDS_PER_BLOB - len(fields))
    return b"".join(f.to_bytes(32, "big") for f in fields)


SINGLE_BLOB = [123 + i for i in range(400)]
THREE_BLOBS = [456 + i for i in range(FIELDS_PER_BLOB * 2 + 123)]

# (name, blobs, z, gamma): z and gamma are the values the circuit derives for each test checkpoint.
CHECKPOINTS = [
    (
        "single_blob",
        [SINGLE_BLOB],
        0x0385A84E8D5E59BDE136BB296DBDA99180C409974A07B2D7084D9C4E3B06DC69,
        0x08E511E4E4C9035C35ACD8EA601D46F020E2D69FDF2DEACE017ADCCE741873CA,
    ),
    (
        "checkpoint_0",
        [THREE_BLOBS[:FIELDS_PER_BLOB], THREE_BLOBS[FIELDS_PER_BLOB : 2 * FIELDS_PER_BLOB]],
        0x21AD45338179E38DFA1901B67D478AA5490374052E972A558910F508000AC197,
        0x1FFCBF586F1B98C350FF33E36F3B8DC6B070BA8CCFDDBE24A11278988388AE8E,
    ),
    (
        "checkpoint_1",
        [THREE_BLOBS[2 * FIELDS_PER_BLOB :]],
        0x01DB0EB27AF8C7FB65DB7758A387748069EF17D62E87F76D8DE4D5204C3D1EB5,
        0x19521222F92697EFE2572090A4E1CD602A671FB00C90A6FD17C0B95C74668653,
    ),
]


# The expected (D, E) of test_1_blob_batched and test_two_checkpoints_batched.
TEST_OPENINGS = [
    ("a696d6e3d847e5858f8510feab39f5f6f1aa69b4e540a00ae63b9369b4b4fe704b00b7cec53802811ef93f83fd3ca9ad", "861889356b89178b220ffffb6f66328bb58a42d9256a07008bf308b896c1cacc3a8d150c1e081c52ee92ab9d9329a71a"),
    ("8379778e41802374175a2df22b8e4af30cb7dbb5b59dd696fdb9bb71236f9c2d4135aa4a844166d4f02630f8b2c7eac6", "960e2e961dd06398352fdf430f32b19577de6461968e7e7db20bcc525ac832fb8f1b602235312d64d6befe8472551713"),
]


def to_point(compressed):
    return decompress_G1(int.from_bytes(compressed, "big"))


def limbs(v):
    return [hex((v >> (120 * i)) & ((1 << 120) - 1)) for i in range(4)]


def proofs(ts):
    for name, blobs, z, gamma in CHECKPOINTS:
        q = Z1
        for l, fields in enumerate(blobs):
            blob = blob_bytes(fields)
            commitment = ckzg.blob_to_kzg_commitment(blob, ts)
            proof, y = ckzg.compute_kzg_proof(blob, z.to_bytes(32, "big"), ts)
            assert ckzg.verify_kzg_proof(commitment, z.to_bytes(32, "big"), y, proof, ts)
            x, _ = normalize(to_point(commitment))
            print(f"{name} blob {l} commitment x limbs {limbs(int(x))}")
            q = add(q, multiply(to_point(proof), pow(gamma, l, BLS_R)))
        x, y = normalize(q)
        print(f"{name} Q x limbs {limbs(int(x))} y limbs {limbs(int(y))}")
        print(f"{name} Q compressed {compress_G1(q).to_bytes(48, 'big').hex()}")


def verify(ts, pairs):
    zero = bytes(32)
    ok = True
    for d, e in pairs:
        result = ckzg.verify_kzg_proof(bytes.fromhex(d), zero, zero, bytes.fromhex(e), ts)
        print(f"D={d} E={e} pairing check: {'PASS' if result else 'FAIL'}")
        ok &= result
    return ok


if __name__ == "__main__":
    ts = ckzg.load_trusted_setup(os.environ.get("TRUSTED_SETUP", "trusted_setup.txt"), 0)
    if sys.argv[1] == "proofs":
        proofs(ts)
    elif sys.argv[1] == "verify":
        args = sys.argv[2:]
        pairs = list(zip(args[::2], args[1::2])) if args else TEST_OPENINGS
        sys.exit(0 if verify(ts, pairs) else 1)
