#!/usr/bin/env python3
"""Derives the Inbox rolling-hash reference vectors pinned by the L1, Noir and TypeScript tests.

The rolling hash is a sha256 chain over the Inbox message leaves. Each link is

    h' = sha256ToField(u32_be(separator) || h(32) || leaf(32) || u64_be(timestamp))

where `sha256ToField(x) = 0x00 || sha256(x)[0..31]` (the last digest byte is dropped so the result fits a field), and
the separator is INBOX_ROLLING_HASH_BUCKET_START when the leaf is the first message of an L1 Inbox bucket and
INBOX_ROLLING_HASH otherwise. `timestamp` is the L1 timestamp of the bucket the leaf belongs to, so every leaf of a
bucket links with the same value. The genesis rolling hash is zero.

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

# The timestamp used by every vector that is not specifically about timestamps.
TS = 1000


def sha256_to_field(preimage: bytes) -> int:
    return int.from_bytes(b"\x00" + hashlib.sha256(preimage).digest()[:31], "big")


def link(prev: int, leaf: int, opens_bucket: bool, timestamp: int) -> int:
    separator = BUCKET_START if opens_bucket else LINK
    preimage = (
        separator.to_bytes(4, "big")
        + prev.to_bytes(32, "big")
        + leaf.to_bytes(32, "big")
        + timestamp.to_bytes(8, "big")
    )
    return sha256_to_field(preimage)


def chain(start: int, buckets: list[tuple[int, list[int]]]) -> int:
    """Chains message leaves grouped per Inbox bucket; the first leaf of each group opens a bucket.

    Each group is a `(timestamp, leaves)` pair: the bucket's L1 timestamp links every one of its leaves.
    """
    acc = start
    for timestamp, leaves in buckets:
        assert leaves, "an Inbox bucket always holds at least one message"
        for i, leaf in enumerate(leaves):
            acc = link(acc, leaf, i == 0, timestamp)
    return acc


def main() -> None:
    vectors = [
        ("single leaf: chain(0, [(1000, [11])])", chain(0, [(TS, [11])])),
        ("three leaves in one bucket: chain(0, [(1000, [11, 22, 33])])", chain(0, [(TS, [11, 22, 33])])),
        ("256 leaves 1..=256 in one bucket at ts 1000", chain(0, [(TS, list(range(1, 257)))])),
        ("non-zero start, one leaf: chain(0x2a, [(1000, [7])])", chain(0x2A, [(TS, [7])])),
        ("non-zero start, two leaves in one bucket: chain(0x2a, [(1000, [7, 8])])", chain(0x2A, [(TS, [7, 8])])),
        ("one bucket: chain(0, [(1000, [11, 22, 33, 44])])", chain(0, [(TS, [11, 22, 33, 44])])),
        (
            "two buckets, same timestamp (rollover siblings): chain(0, [(1000, [11, 22]), (1000, [33, 44])])",
            chain(0, [(TS, [11, 22]), (TS, [33, 44])]),
        ),
        (
            "two buckets, ascending timestamps: chain(0, [(1000, [11, 22]), (1001, [33, 44])])",
            chain(0, [(TS, [11, 22]), (TS + 1, [33, 44])]),
        ),
        ("single leaf at timestamp 0: chain(0, [(0, [11])])", chain(0, [(0, [11])])),
        ("single leaf at timestamp 2**64-1: chain(0, [(2**64-1, [11])])", chain(0, [(2**64 - 1, [11])])),
    ]
    for name, value in vectors:
        print(f"{value:#066x}  {name}")

    # Identical leaves, different bucket grouping: the boundary-commitment vector.
    assert chain(0, [(TS, [11, 22, 33, 44])]) != chain(0, [(TS, [11, 22]), (TS, [33, 44])])
    # Identical leaves and grouping, different bucket timestamp: the timestamp-commitment vector.
    assert chain(0, [(TS, [11])]) != chain(0, [(TS + 1, [11])])
    assert chain(0, [(TS, [11, 22]), (TS, [33, 44])]) != chain(0, [(TS, [11, 22]), (TS + 1, [33, 44])])
    # Continuity: a chain split into segments threads the intermediate hash, flags following the leaves.
    assert chain(0x2A, [(TS, [7, 8])]) == link(chain(0x2A, [(TS, [7])]), 8, False, TS)


if __name__ == "__main__":
    main()
