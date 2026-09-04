#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstddef>
#include <cstdint>
#include <vector>

// Flat C ABI over Poseidon2, for in-process consumers that must hash at high
// frequency but want no dependency on barretenberg's C++ headers, field type,
// stdlib, or build flags (e.g. the standalone world-state DB service). Field
// elements cross as 32 canonical bytes (barretenberg's field serialization);
// the montgomery form stays private to barretenberg.
namespace {
using FF = bb::fr;
using Poseidon2Bn254 = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;
} // namespace

extern "C" {

// Hash `n` field elements. `elems` is n*32 canonical bytes; `out` receives 32.
void bb_poseidon2_hash(const uint8_t* elems, size_t n, uint8_t* out)
{
    std::vector<FF> inputs;
    inputs.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        inputs.push_back(FF::serialize_from_buffer(elems + (i * 32)));
    }
    FF::serialize_to_buffer(Poseidon2Bn254::hash(inputs), out);
}

// Hash { separator, lhs, rhs } — matches Poseidon2HashPolicy::hash_pair_with_separator,
// the domain-separated internal-node hash used by the Aztec merkle trees.
void bb_poseidon2_hash_pair_with_separator(uint64_t separator, const uint8_t* lhs, const uint8_t* rhs, uint8_t* out)
{
    std::vector<FF> inputs{ FF(separator), FF::serialize_from_buffer(lhs), FF::serialize_from_buffer(rhs) };
    FF::serialize_to_buffer(Poseidon2Bn254::hash(inputs), out);
}

} // extern "C"
