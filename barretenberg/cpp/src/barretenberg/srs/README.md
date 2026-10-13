# Structured reference strings (SRS)

bb uses a BN254 SRS (from the Aztec Ignition trusted setup) for KZG and a Grumpkin SRS for IPA. `global_crs.cpp` and `factories/` load them.

### Location

Both SRS files are cached in `~/.bb-crs` (`bb_crs_path()` in `global_crs.cpp`). Set `CRS_PATH`, or pass `--crs_path` to `bb`, to use another directory.

### BN254

The Ignition ceremony produced 100,800,000 G1 points and 1 G2 point, over the BN254 curve. bb uses the first `SRS_TOTAL_POINTS = 100000000` of them (`factories/bn254_g1_chunk_hashes.hpp`).

- **Download.** bb downloads `http://crs.aztec-cdn.foundation/g1_compressed.dat` (fallback `http://crs.aztec-labs.com/g1_compressed.dat`) with HTTP range requests. Points are compressed to 32 bytes. bb fetches only the points the circuit needs, rounded up to 2^17-point chunks, and checks each chunk against an embedded SHA-256 hash (`factories/get_bn254_crs.cpp`).
- **Cache.** bb decompresses the points and caches them in `~/.bb-crs/bn254_g1.dat`, 64 bytes per point (x then y). Each coordinate is one 32-byte big-endian integer. The CDN also serves the uncompressed `g1.dat` in the same layout.
- **G1 points.** The first point is the generator `[1] = (1, 2)`; point `i` is `x^i.[1]`, where `x` is the trusted setup toxic waste (`factories/bn254_crs_data.hpp`). Each ceremony participant generated their own randomness `z` and multiplied point `i` by `z^i`.
- **G2 point.** The only G2 point is `x.[2]`. bb embeds its 128 bytes (`BN254_G2_ELEMENT_BYTES`, the same bytes as `https://crs.aztec-cdn.foundation/g2.dat`). `[2]` is the BN254 G2 generator with coordinates:

```
{
    "x": {
        "c0": "10857046999023057135944570762232829481370756359578518086990519993285655852781",
        "c1": "11559732032986387107991004021392285783925812861821192530917403151452391805634"
    },
    "y": {
        "c0": "8495653923123431417604973247489272438418190587263600148770280649306958101930",
        "c1": "4082367875863433681332203403145435568316851327593401208105741076214120093531"
    }
}
```

### Grumpkin

The Grumpkin SRS has `2^18` points, no toxic-waste trust assumptions and no G2 group. bb derives it from a seed (`factories/grumpkin_srs_gen.cpp`) instead of downloading it, and caches it in `~/.bb-crs/grumpkin_g1_v2.flat.dat`, checked against embedded chunk hashes.

### Citation

The ceremony description is adapted from https://github.com/AztecProtocol/ignition-verification/blob/master/Transcript_spec.md.
