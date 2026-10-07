# BN254 proof-of-possession gas

Does proof-of-possession (PoP) verification of honestly generated BLS keys fit the GSE's configured gas cap?

`GSE._checkProofOfPossession` calls `Bn254LibWrapper.proofOfPossession{gas: proofOfPossessionGasLimit}` (250,000 by
default, owner-settable). The cost of that call depends on the key: `BN254Lib.hashToPoint` is an unbounded rejection
loop. Each loop attempt hashes `(domain, pk1, attempt)` with keccak. It rejects `x >= p` (81% of attempts) and
otherwise calls the modexp precompile to take a square root, which fails half the time. This directory measures that
cost, fits a cost model, and publishes calibration vectors for off-chain key tooling.

The measured numbers live in two places: the fixture carries the fitted model and the max-iterations bound per cap,
and `scripts/bn254_pop_gas_model.py` prints the full tables (precompile prices, fit residuals, over-cap probabilities)
on every run. Treat `amsterdam` numbers as provisional until they are re-measured on a network running Glamsterdam.

## Files

| File | Purpose |
|---|---|
| `PopGasBase.sol` | Shared helpers: a counting mirror of `hashToPoint` (checked against the library), and measurement of the wrapper frame (gas used, minimum stipend). |
| `BN254G2TestLib.sol` | Test-only G2 scalar multiplication, used by the generator and by the CI test to build `pk2 = sk * G2` for test scalars. Checked against `bn254_constants.json`. |
| `PopGasScan.t.sol` | Offline scan of `sk = 1..N` for long-tail keys and the attempt/sqrt-call histograms. Skipped unless `POP_GAS_SCAN_MAX` is set. |
| `PopGasGenerate.t.sol` | Measures the corpus and prints one line per vector. Skipped unless `POP_GAS_GENERATE=true`. |
| `PopGasVectors.t.sol` | Runs in CI. Rebuilds every fixture vector's registration tuple from `sk` and checks it: valid PoP, attempt counts and digest match the library, and recorded gas matches the active EVM version. It also checks that the model bounds every vector and that the published N values are consistent. |
| `../../../scripts/bn254_pop_gas_model.py` | Runs the generator per EVM version, fits the model on the whole corpus, writes the fixture, and prints the result tables (stdlib only). |
| `../../fixtures/bn254_pop_gas_vectors.json` | Fitted model, max-iterations bounds, and the committed subset of calibration vectors (format below). |

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

## When `PopGasVectorsTest` fails in CI

The test asserts the exact gas of every committed vector for the EVM version it detects. That is deliberate: it is
the tripwire that notices when a compiler, optimizer, library or precompile-pricing change moves the verifier's cost
relative to the GSE cap. A gas mismatch means the numbers are stale, not that the test is wrong. Regenerate, then read
the over-cap table the script prints for the EVM versions that matter and review the model and `maxIterations`
changes in the fixture:

```bash
python3 scripts/bn254_pop_gas_model.py              # Foundry 1.8.4 on PATH
```

## Method

- **Verification gas**: gas used by the `Bn254LibWrapper` call frame (`vm.lastCallGas().gasTotalUsed`) with an ample
  stipend. This is what the cap limits. It excludes the caller's CALL cost, account access and argument encoding,
  so it reads lower than measurements taken with `gasleft()` around the call in the caller.
- **Minimum stipend**: the smallest `{gas: g}` for which the call returns `true`, found by binary search. It sits a
  little above the verification gas: the precompile calls forward `sub(gas(), 2000)`, capped at 63/64 of the
  remaining gas, so the frame needs headroom at the pairing call. The cap must cover the minimum stipend, not the
  verification gas.
- **Corpus**: 152 valid tuples, measured by the generator: the 50 sample keys of `bn254_constants.json`, `sk = 1..32`,
  and 70 long-tail keys from the scan. A bulk set of 2,000 more keys (`sk = 33..2032`) uses the G2 generator as `pk2`.
  The pairing then returns false at the same gas, because every precompile price here depends only on input sizes.
  The generator asserts that equality on every valid vector. The model is fitted on all 2,152 points.
- **Committed subset**: the fixture keeps the vectors listed in `FIXTURE_LABELS` in the script, 20 keys that span
  attempts 1..139 and sqrt calls 1..24, both root choices, both orderings of the sqrt result, and zero or many field
  rejections. The script checks that coverage before writing. The other scalars stay in `PopGasGenerate.t.sol` and
  are re-measured on every regeneration.
- **Bytecode**: the compiled `Bn254LibWrapper` runtime code (prague or amsterdam target) is byte-identical, apart
  from the CBOR metadata, to the wrapper the mainnet GSE created (`0x656F9140B9e2d3769D47b575512d46039dCab4D3`,
  GSE `0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f` at nonce 1). So these numbers apply to the deployed verifier.

## Reading the results

### Cost model

`gas <= F + A * attempts + S * sqrtCalls + Q * attempts^2`, fitted by least squares to all 2,152 points per EVM
version. `Q * attempts^2` is memory growth. Every attempt's `abi.encode` allocates 7 words that are never freed, and
memory costs `words^2 / 512`, so the theoretical value is `Q = 49/512 = 0.0957`. The conservative constants round A
and S up, take `Q = max(fit, 49/512)`, and raise F until the model upper-bounds every measured point. The fixture
stores the conservative constants per EVM version, for both the verification gas and the minimum stipend.

The components are: fixed work (the pairing, two `ecMul`, two `ecAdd`, the infinity checks, the gamma keccak, ABI
decoding and the final root-selection keccak), a per-attempt term (keccak over 192 bytes, `abi.encode`, linear memory
and loop overhead), a per-sqrt-call term (the modexp precompile plus field arithmetic and call setup), and the
quadratic memory term. The modexp price is what differs between EVM versions on this path.

### Attempt distribution

Each attempt is uniform over `[0, 2^256)`. `P(x < p) = p / 2^256 = 0.189030554816`. BN254 G1 has prime order r and
no point with `y = 0`, so exactly `(r - 1) / 2` values of x give a point. The per-attempt success probability is
therefore `q = ((r - 1) / 2) / 2^256 = 0.094515277408`, and `P(attempts > N) = (1 - q)^N`. Mean attempts are 10.58
and mean sqrt calls are 2.00. The scan of `sk = 1..2,000,000` matches: mean attempts 10.573, mean sqrt calls 1.999.
Measured `P(attempts > 18) = 0.1675` against 0.1674 predicted, `P(attempts > 95) = 7.9e-5` against 8.0e-5, and 15
keys with at least 18 sqrt calls against 15.3 expected. The largest values in the scan are 139 attempts and 24 sqrt
calls. The loop has no upper bound, so no finite worst case exists for an arbitrary key.

### Max iterations N (key tooling bound)

N is the largest attempt count for which the conservative min-stipend model stays within `cap * (1 - margin)`,
assuming the worst case where every one of the N attempts calls sqrt. A key whose `hashToPoint` needs at most N
attempts therefore verifies within the cap with at least that margin. `P(attempts > N) = (1 - q)^N` is the chance
that a random key must be discarded and re-derived. The fixture's `maxIterations` carries N per cap and EVM version
at a 10% margin; the script also prints N with no margin.

For caps where N exceeds the measured maximum of 24 sqrt calls, the model is extrapolated in sqrt calls. Each sqrt
call runs the same code at the same precompile price, so the per-call cost is constant. Large caps also extrapolate
in attempts beyond 139 along the exact quadratic memory formula.

### Honest keys over the cap

`P(min stipend > cap)` for a random key is summed over the exact joint distribution of (attempts, sqrtCalls):
`P(a, k) = C(a-1, k-1) * P_reject^(a-k) * P_sqrtFail^(k-1) * q`. The script prints it per cap and EVM version.

An invalid entry with a typical pk1 burns about the cost of a valid verification. The pairing check runs at the same
price and returns false. An entry whose pk1 needs a long `hashToPoint`, or which runs out of gas, burns the whole
stipend, so the cost of a failing entry is bounded only by the cap.

## Fixture format: `test/fixtures/bn254_pop_gas_vectors.json`

Every `sk` in the file is a public test scalar: a small integer or a published sample key. Never use any of these
keys for a real validator. Field elements are `0x`-prefixed, zero-padded 32-byte hex strings. Counts and gas values
are JSON numbers.

A vector stores the scalar and what `hashToPoint` does with it. The registration tuple is not stored: it is
`pk1 = sk * G1`, `pk2 = sk * G2` and `signature = sk * digest`, which `PopGasVectorsTest` (and any other consumer)
derives from `sk`. The `sample-<i>` scalars are the `sampleKeys` of `bn254_constants.json`, by index, and that file
carries their `pk1` and `pk2`.

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

A differential test in other tooling derives `pk1` from `sk`, runs its own `hashToPoint` on it, and compares
`digest`, `attempts`, `sqrtCalls`, `fieldRejections`, `swapped` and `rootBit` field by field. It can then check that
`bound(attempts, sqrtCalls) >= gas.<evm>.minStipend` and that `attempts <= N` implies a fit within the budget.
