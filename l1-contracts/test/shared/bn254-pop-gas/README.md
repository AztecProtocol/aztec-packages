# BN254 proof-of-possession gas

Does proof-of-possession (PoP) verification of honestly generated BLS keys fit the GSE's configured gas cap?

`GSE._checkProofOfPossession` calls `Bn254LibWrapper.proofOfPossession{gas: proofOfPossessionGasLimit}` (250,000 by
default, owner-settable). The cost of that call depends on the key: `BN254Lib.hashToPoint` is an unbounded rejection
loop. Each loop attempt hashes `(domain, pk1, attempt)` with keccak. It rejects `x >= p` (81% of attempts) and
otherwise calls the modexp precompile to take a square root, which fails half the time. This directory measures that
cost, fits a cost model, and publishes calibration vectors for off-chain key tooling.

All numbers below are from local Forge runs. Treat the `amsterdam` column as provisional until it is re-measured on a
network running Glamsterdam.

## Files

| File | Purpose |
|---|---|
| `PopGasBase.sol` | Shared helpers: a counting mirror of `hashToPoint` (checked against the library), and measurement of the wrapper frame (gas used, minimum stipend). |
| `BN254G2TestLib.sol` | Test-only G2 scalar multiplication, used to build `pk2 = sk * G2` for test scalars. Checked against `bn254_constants.json`. |
| `PopGasScan.t.sol` | Offline scan of `sk = 1..N` for long-tail keys and the attempt/sqrt-call histograms. Skipped unless `POP_GAS_SCAN_MAX` is set. |
| `PopGasGenerate.t.sol` | Measures the corpus and prints one line per vector. Skipped unless `POP_GAS_GENERATE=true`. |
| `PopGasVectors.t.sol` | Runs in CI. Checks every fixture vector: valid PoP, attempt counts and digest match the library, and recorded gas matches the active EVM version. It also checks that the model bounds every vector and that the published N values are consistent. |
| `../../../scripts/bn254_pop_gas_model.py` | Runs the generator per EVM version, fits the model, writes the fixture, and prints the tables below (stdlib only). |
| `../../fixtures/bn254_pop_gas_vectors.json` | Calibration vectors and fitted model (format below). |

## Commands

Tools: Foundry `1.8.4` (commit `50af4efe`, needed for `--evm-version amsterdam`), solc `0.8.30`, optimizer 100 runs,
Python 3 (stdlib). `PopGasVectorsTest` also passes on Foundry `1.4.1` with the default `prague` setting.

```bash
cd l1-contracts
export PATH=$HOME/.foundry-1.8.4/bin:$PATH   # a forge that knows amsterdam

# 1. Long-tail scan (EVM-independent, ~2 min). Prints POPSCAN_TAIL <sk> <attempts> <sqrtCalls>.
POP_GAS_SCAN_MAX=2000000 POP_GAS_SCAN_MIN_ATTEMPTS=110 POP_GAS_SCAN_MIN_SQRT=17 \
  forge test --match-contract PopGasScanTest -vv --gas-limit 9000000000000000000

# 2. Measure amsterdam, osaka, prague (~1 min each), fit, write the fixture, print the tables.
python3 scripts/bn254_pop_gas_model.py              # logs go to out/bn254-pop-gas/gen_<evm>.log

# 3. Check the fixture against the active EVM version (this runs in CI).
forge test --match-contract PopGasVectorsTest --evm-version amsterdam
```

## Method

- **Verification gas**: gas used by the `Bn254LibWrapper` call frame (`vm.lastCallGas().gasTotalUsed`) with an ample
  stipend. This is what the cap limits. It excludes the caller's CALL cost, account access and argument encoding,
  so it reads lower than measurements taken with `gasleft()` around the call in the caller.
- **Minimum stipend**: the smallest `{gas: g}` for which the call returns `true`, found by binary search. It is 1,730
  to 1,734 gas above the verification gas. The precompile calls forward `sub(gas(), 2000)`, capped at 63/64 of the
  remaining gas, so the frame needs headroom at the 113,000-gas pairing call. The cap must cover the minimum stipend,
  not the verification gas.
- **Corpus**: 152 valid tuples. They are the 50 sample keys of `bn254_constants.json`, `sk = 1..32`, and 70
  long-tail keys from the scan, including `sk = 57193` (95 attempts, 18 sqrt calls). Together they cover attempts
  1..139, sqrt calls 1..24, both root choices, both orderings of the sqrt result, and zero or many field rejections.
  A bulk set of 2,000 more keys (`sk = 33..2032`) uses the G2 generator as `pk2`. The pairing then returns false at
  the same gas, because every precompile price here depends only on input sizes. The generator asserts that equality
  on every valid vector.
- **Bytecode**: the compiled `Bn254LibWrapper` runtime code (prague or amsterdam target) is byte-identical, apart
  from the CBOR metadata, to the wrapper the mainnet GSE created (`0x656F9140B9e2d3769D47b575512d46039dCab4D3`,
  GSE `0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f` at nonce 1). So these numbers apply to the deployed verifier.

## Results

### Precompile prices (measured)

| EVM | modexp (sqrt input) | ecAdd | ecMul | ecPairing (2 pairs) |
|---|---|---|---|---|
| amsterdam | 4,016 | 150 | 6,000 | 113,000 |
| osaka | 4,016 | 150 | 6,000 | 113,000 |
| prague | 1,338 | 150 | 6,000 | 113,000 |

Under Foundry 1.8.4, `amsterdam` charges exactly what `osaka` charges along this code path. Every vector has
identical gas in the two columns.

### Cost model

`gas <= F + A * attempts + S * sqrtCalls + Q * attempts^2`, fitted by least squares to all 2,152 points per EVM
version. `Q * attempts^2` is memory growth. Every attempt's `abi.encode` allocates 7 words that are never freed, and
memory costs `words^2 / 512`, so the theoretical value is `Q = 49/512 = 0.0957`. The conservative constants round A
and S up, take `Q = max(fit, 49/512)`, and raise F until the model upper-bounds every measured point.

| EVM | quantity | F | A | S | Q | max abs residual (fit) | conservative F, A, S, Q | conservative over-estimate |
|---|---|---|---|---|---|---|---|---|
| amsterdam | min stipend | 132,689.0 | 514.25 | 4,579.08 | 0.0960 | 7.8 | 132,694, 515, 4,580, 0.095975 | 0.1..125.7 |
| amsterdam | verification gas | 130,955.2 | 514.28 | 4,579.08 | 0.0960 | 8.0 | 130,960, 515, 4,580, 0.095952 | 0.1..121.3 |
| amsterdam | `g1ToDigestPoint` call | 1,549.6 | 512.66 | 4,579.09 | 0.0960 | 8.3 | 1,555, 513, 4,580 | 0.1..74.2 |
| osaka | min stipend | 132,689.0 | 514.25 | 4,579.08 | 0.0960 | 7.8 | 132,694, 515, 4,580, 0.095975 | 0.1..125.7 |
| prague | min stipend | 132,689.0 | 514.25 | 1,901.08 | 0.0960 | 7.8 | 132,694, 515, 1,902, 0.095975 | 0.1..125.7 |
| prague | verification gas | 130,955.2 | 514.28 | 1,901.08 | 0.0960 | 8.0 | 130,960, 515, 1,902, 0.095952 | 0.1..121.3 |

Components (amsterdam):

- **Fixed work, about 131k**: the pairing (113,000), two `ecMul` (12,000), two `ecAdd` (300), the infinity checks,
  the gamma keccak, ABI decoding and the final root-selection keccak. Verification minus the digest call is
  129,407..129,630 gas. It drifts slightly with attempts because later allocations land on a larger memory.
- **Per attempt, A = 515**: the keccak over 192 bytes, `abi.encode`, linear memory and loop overhead.
- **Per sqrt call, S = 4,580**: modexp 4,016 plus 564 of field arithmetic and call setup. Under prague it is
  1,902 (1,338 + 564).
- **Memory, Q ≈ 0.096 per attempt²**: 1.9k gas at 139 attempts, 2.2k at 150.
- **Minimum stipend offset**: +1,734 gas over verification gas, folded into the min-stipend F.

### Selected vectors

| vector | attempts | sqrtCalls | prague gas | prague min stipend | amsterdam gas | amsterdam min stipend | at 250k (amsterdam) |
|---|---|---|---|---|---|---|---|
| small-12 | 1 | 1 | 133,367 | 135,101 | 136,045 | 137,779 | fits |
| sample-0 | 15 | 1 | 140,589 | 142,322 | 143,267 | 145,000 | fits |
| small-11 | 31 | 3 | 152,688 | 154,420 | 160,722 | 162,454 | fits |
| sample-4 | 42 | 7 | 166,026 | 167,759 | 184,772 | 186,505 | fits |
| tail-13154 | 102 | 10 | 203,428 | 205,159 | 230,208 | 231,939 | fits |
| tail-57193 | 95 | 18 | 214,891 | 216,622 | 263,095 | 264,826 | over |
| tail-865039 | 138 | 12 | 226,560 | 228,290 | 258,696 | 260,426 | over |
| tail-723828 | 139 | 13 | 229,015 | 230,745 | 263,829 | 265,559 | over |
| tail-241572 | 128 | 19 | 234,469 | 236,199 | 285,351 | 287,081 | over |
| tail-693083 | 97 | 23 | 225,462 | 227,193 | 287,056 | 288,787 | over |
| tail-1314687 | 116 | 24 | 237,522 | 239,253 | 301,794 | 303,525 | over |

### Attempt distribution

Each attempt is uniform over `[0, 2^256)`. `P(x < p) = p / 2^256 = 0.189030554816`. BN254 G1 has prime order r and
no point with `y = 0`, so exactly `(r - 1) / 2` values of x give a point. The per-attempt success probability is
therefore `q = ((r - 1) / 2) / 2^256 = 0.094515277408`, and `P(attempts > N) = (1 - q)^N`. Mean attempts are 10.58
and mean sqrt calls are 2.00. The scan of `sk = 1..2,000,000` matches: mean attempts 10.573, mean sqrt calls 1.999.
Measured `P(attempts > 18) = 0.1675` against 0.1674 predicted, `P(attempts > 95) = 7.9e-5` against 8.0e-5, and 15
keys with at least 18 sqrt calls against 15.3 expected. The largest values in the scan are 139 attempts and 24 sqrt
calls. The loop has no upper bound, so no finite worst case exists for an arbitrary key.

### Max iterations N (key tooling bound)

N is the largest attempt count for which the conservative min-stipend model stays within `cap * (1 - 10%)`,
assuming the worst case where every one of the N attempts calls sqrt. A key whose `hashToPoint` needs at most N
attempts therefore verifies within the cap with at least a 10% margin. `P(attempts > N)` is the chance that a random
key must be discarded and re-derived.

| EVM | cap | budget | N | worst-case min stipend at N | P(attempts > N) | N with no margin |
|---|---|---|---|---|---|---|
| amsterdam | 250,000 | 225,000 | **18** | 224,435 | 0.1674 | 23 |
| amsterdam | 300,000 | 270,000 | 26 | 265,229 | 0.07567 | 32 |
| amsterdam | 500,000 | 450,000 | 62 | 448,953 | 0.002121 | 71 |
| amsterdam | 1,000,000 | 900,000 | 150 | 899,103 | 3.4e-7 | 169 |
| prague | 250,000 | 225,000 | 38 | 224,679 | 0.02299 | 48 |

For N up to 26, the model is extrapolated in sqrt calls beyond the measured maximum of 24. Each sqrt call runs the
same code at the same precompile price, so the per-call cost is constant. The 500k and 1M rows also extrapolate in
attempts beyond 139 along the exact quadratic memory formula.

### Honest keys over the cap

`P(min stipend > cap)` for a random key, summed over the exact joint distribution of (attempts, sqrtCalls):
`P(a, k) = C(a-1, k-1) * P_reject^(a-k) * P_sqrtFail^(k-1) * q`.

| EVM | cap | P(key over cap) | 1 in | invalid entry, typical key | invalid entry, worst case |
|---|---|---|---|---|---|
| amsterdam | 250,000 | 3.5e-5 | 28,559 | ~139k | 250,000 (whole cap) |
| amsterdam | 300,000 | 4.0e-7 | 2,484,286 | ~139k | 300,000 |
| amsterdam | 500,000 | 9.6e-15 | 1.05e14 | ~139k | 500,000 |
| amsterdam | 1,000,000 | 5.1e-33 | 1.95e32 | ~139k | 1,000,000 |
| prague | 250,000 | 2.4e-7 | 4,219,373 | ~136k | 250,000 |

An invalid entry with a typical pk1 burns about the cost of a valid verification. The pairing check runs at the same
price and returns false. An entry whose pk1 needs a long `hashToPoint`, or which runs out of gas, burns the whole
stipend, so the cost of a failing entry is bounded only by the cap.

## Fixture format: `test/fixtures/bn254_pop_gas_vectors.json`

Every `sk` in the file is a public test scalar: a small integer or a published sample key. Never use any of these
keys for a real validator. Field elements are `0x`-prefixed, zero-padded 32-byte hex strings. Counts and gas values
are JSON numbers.

```jsonc
{
  "description": "...",
  "domainSeparator": "AZTEC_BLS_POP_BN254_V1",       // bytes32 string used by hashToPoint
  "evmVersions": ["amsterdam", "osaka", "prague"],
  "model": {                                          // conservative constants per EVM version
    "<evm>": {
      "minStipend":   { "F": 132694, "A": 515, "S": 4580, "QNumerator": 95975, "QDenominator": 1000000 },
      "verification": { "F": 130960, "A": 515, "S": 4580, "QNumerator": 95952, "QDenominator": 1000000 }
    }
  },
  // bound(attempts, sqrtCalls) = F + A*attempts + S*sqrtCalls + ceil(QNumerator*attempts^2 / QDenominator)
  "maxIterations": [                                  // N per cap, worst case sqrtCalls == attempts == N
    { "cap": 250000, "marginPercent": 10, "amsterdam": 18, "osaka": 18, "prague": 38 }
  ],
  "vectors": [
    {
      "label": "tail-57193",                          // sample-<i> | small-<sk> | tail-<sk>
      "sk": "0x…df69",                                 // public test scalar
      "pk1": { "x": "0x…", "y": "0x…" },               // sk * G1
      "pk2": { "x0": "0x…", "x1": "0x…", "y0": "0x…", "y1": "0x…" }, // sk * G2; x = x0 + x1*u (x0 real)
      "signature": { "x": "0x…", "y": "0x…" },         // sk * digest
      "digest": { "x": "0x…", "y": "0x…" },            // hashToPoint(domain, pk1.x || pk1.y)
      "attempts": 95,                                  // hashToPoint loop iterations (keccak evaluations)
      "sqrtCalls": 18,                                 // attempts with x < p (modexp calls)
      "fieldRejections": 77,                           // attempts with x >= p; attempts = sqrtCalls + fieldRejections
      "swapped": false,                                // sqrt returned the larger root, so (y0, y1) were swapped
      "rootBit": 0,                                    // keccak(domain, message, 2^256-1) & 1: 0 smaller y, 1 larger
      "gas": {
        "<evm>": { "verification": 263095, "minStipend": 264826 }
      }
    }
  ]
}
```

A differential test in other tooling can recompute `pk1`, `digest`, `attempts`, `sqrtCalls`, `fieldRejections`,
`swapped` and `rootBit` from `sk` and compare them field by field. It can then check that
`bound(attempts, sqrtCalls) >= gas.<evm>.minStipend` and that `attempts <= N` implies a fit within the budget.

## Recommendation

- **v6 key derivation, max iterations: N = 18** (amsterdam, 250k cap, 10% margin). A key needing at most 18 attempts
  has a worst-case minimum stipend of 224,435 gas against the 250,000 cap. About 16.7% of candidate keys exceed 18
  attempts and must be re-derived. That is an off-chain cost only. N = 18 stays valid for any cap of at least 250k,
  so it does not depend on a governance change.
- **Cap**: under amsterdam/osaka pricing, 250k rejects about 1 in 28.6k honest keys that were not produced under the
  N bound. Raising the cap to 300k through `setProofOfPossessionGasLimit` cuts that to about 1 in 2.5M, for at most
  50k more gas burned per failing entry. It would also allow N = 26 (7.6% re-derivation). Caps of 500k or 1M lower
  the rate much further, but they double or quadruple the gas each failing entry can burn, which raises the
  worst-case cost of flushing each entry. The recommendation is to raise the cap to 300k, and to keep tooling on N = 18 until
  the change is executed and the numbers are re-measured on a network running Glamsterdam.
