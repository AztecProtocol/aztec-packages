// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct SumcheckBench
 * @brief Time a full MegaFlavor (non-ZK) sumcheck prove over a synthetic instance of
 * size 2^log_n, for comparison against the WebGPU sumcheck. Builds random prover
 * polynomials, runs SumcheckProver::prove(), and returns the elapsed prove time.
 * Witness validity is irrelevant — the relations run regardless.
 *
 * Sparsity (for an apples-to-apples comparison against the skipping WebGPU engine over
 * the SAME circuit profile): `used_rows` sets the witness end_index so
 * compute_effective_round_size trims the dyadic zero tail, and `densities` (per relation,
 * basis points) zero each relation's selector on its inactive rows so its `skip()` fires
 * on the same row pattern the GPU skips. The zero pattern — not the random values — is
 * what must match across engines, since skip()/effective-size depend only on the zeros.
 * `used_rows == 0` or `>= 2^log_n` and all densities == 10000 reproduce the original
 * fully-dense instance exactly.
 */
struct SumcheckBench {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "SumcheckBench";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "SumcheckBenchResponse";
        uint64_t microseconds;
        uint32_t num_rounds;
        SERIALIZATION_FIELDS(microseconds, num_rounds);
        bool operator==(const Response&) const = default;
    };

    uint32_t log_n;
    uint32_t used_rows = 0;          // effective circuit size L; 0 or >= 2^log_n => dense (full)
    uint32_t structure = 0;          // 0 = block-contiguous active rows, 1 = scattered (interleaved)
    std::vector<uint32_t> densities; // per-relation activation density, basis points (0..10000); empty => all dense
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(log_n, used_rows, structure, densities);
    bool operator==(const SumcheckBench&) const = default;
};

} // namespace bb::bbapi
