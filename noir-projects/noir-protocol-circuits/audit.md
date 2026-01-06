
## External Dependencies

### Protocol Circuits - External Dependencies

The following external dependencies are used across the protocol circuits:

| Dependency | Version | Repository |
|------------|---------|------------|
| sha256 | v0.3.0 | https://github.com/noir-lang/sha256 |
| poseidon | v0.1.1 | https://github.com/noir-lang/poseidon |
| bignum | v0.8.2 | https://github.com/noir-lang/noir-bignum |
| bigcurve | v0.12.0 | https://github.com/noir-lang/noir_bigcurve |

#### Internal Dependencies (within noir-protocol-circuits)

- `types` - Core type definitions (depends on sha256, poseidon)
- `blob` - Blob handling (depends on bignum, bigcurve, types)
- `parity_lib` - Parity tree library (depends on types)
- `rollup_lib` - Rollup library (depends on bignum, bigcurve, types, parity_lib, blob)
- `private_kernel_lib` - Private kernel library (depends on types)

### aztec-nr Dependencies

#### External Dependencies

| Dependency | Version | Repository |
|------------|---------|------------|
| sha256 | v0.3.0 | https://github.com/noir-lang/sha256 |
| poseidon | v0.1.1 | https://github.com/noir-lang/poseidon |

#### Cross-Project Dependencies

- `protocol_types` - References `noir-protocol-circuits/crates/types`

#### Internal Dependencies (within aztec-nr)

- `aztec` - Core Aztec library (depends on protocol_types, sha256, poseidon)
- `address_note` - Address note type (depends on aztec)
- `balance_set` - Balance set utilities (depends on aztec, uint_note)
- `compressed_string` - Compressed string utilities (depends on aztec)
- `field_note` - Field note type (depends on aztec)
- `uint_note` - Uint note type (depends on aztec)

## Primitives that might need attention from the crypto team

noir-protocol-circuits/crates/types/src/hash/poseidon2_chunks.nr
noir-protocol-circuits/crates/types/src/poseidon2.nr


# Random thoughts as I go.

See arrays.md for a report on the state of arrays.nr. I didn't have time to ask Claude to fix it and add tests.

Should we strive to use the `for_each_i` helper functions everywhere, to avoid accidental bugs repeating the "dynamic for loop" pattern everywhere?

I need to finish drawing a big diagram of this whole thing. Probably only ready some time mid January.
