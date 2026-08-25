#!/usr/bin/env python3
"""Derives the Inbox rolling-hash reference vectors pinned by the L1, Noir and TypeScript tests.

The rolling hash is a sha256 chain over the Inbox message leaves. Each link is

    h' = sha256ToField(u32_be(separator) || h(32) || leaf(32))

where `sha256ToField(x) = 0x00 || sha256(x)[0..31]` (the last digest byte is dropped so the result fits a field), and
the separator is INBOX_ROLLING_HASH_BUCKET_START when the leaf is the first message of an L1 Inbox bucket and
INBOX_ROLLING_HASH otherwise. The genesis rolling hash is zero.

This script depends on nothing but hashlib, so the vectors it prints are independent of all three implementations.
Run it and paste the values into:

  - l1-contracts/test/InboxBuckets.t.sol (testRollingHashTestVectors)
  - noir-projects/fnd/noir-protocol-circuits/crates/rollup-lib/src/inbox_rolling_hash.nr (tests module)
  - yarn-project/stdlib/src/messaging/inbox_rolling_hash.test.ts
"""

import hashlib

# Domain separators, mirroring DOM_SEP__INBOX_ROLLING_HASH and DOM_SEP__INBOX_ROLLING_HASH_BUCKET_START in
# noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr. They are poseidon2 hashes of a name, so
# their derivation is checked by the Noir constants test rather than here.
LINK = 3737216265
BUCKET_START = 3204844280


def sha256_to_field(preimage: bytes) -> int:
    return int.from_bytes(b"\x00" + hashlib.sha256(preimage).digest()[:31], "big")


def link(prev: int, leaf: int, opens_bucket: bool) -> int:
    separator = BUCKET_START if opens_bucket else LINK
    preimage = separator.to_bytes(4, "big") + prev.to_bytes(32, "big") + leaf.to_bytes(32, "big")
    return sha256_to_field(preimage)


def chain(start: int, buckets: list[list[int]]) -> int:
    """Chains message leaves grouped per Inbox bucket; the first leaf of each group opens a bucket."""
    acc = start
    for bucket in buckets:
        assert bucket, "an Inbox bucket always holds at least one message"
        for i, leaf in enumerate(bucket):
            acc = link(acc, leaf, i == 0)
    return acc


def main() -> None:
    vectors = [
        ("single leaf: chain(0, [[11]])", chain(0, [[11]])),
        ("three leaves in one bucket: chain(0, [[11, 22, 33]])", chain(0, [[11, 22, 33]])),
        ("256 leaves 1..=256 in one bucket", chain(0, [list(range(1, 257))])),
        ("non-zero start, one leaf: chain(0x2a, [[7]])", chain(0x2A, [[7]])),
        ("non-zero start, two leaves in one bucket: chain(0x2a, [[7, 8]])", chain(0x2A, [[7, 8]])),
        ("one bucket: chain(0, [[11, 22, 33, 44]])", chain(0, [[11, 22, 33, 44]])),
        ("two buckets: chain(0, [[11, 22], [33, 44]])", chain(0, [[11, 22], [33, 44]])),
    ]
    for name, value in vectors:
        print(f"{value:#066x}  {name}")

    # The pair above is the boundary-commitment vector: identical leaves, different bucket grouping.
    assert chain(0, [[11, 22, 33, 44]]) != chain(0, [[11, 22], [33, 44]])
    # Continuity: a chain split into segments threads the intermediate hash, flags following the leaves.
    assert chain(0x2A, [[7, 8]]) == link(chain(0x2A, [[7]]), 8, False)


if __name__ == "__main__":
    main()
