// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>

namespace bb::bbapi {

/**
 * @struct SumcheckBench
 * @brief Time a full MegaFlavor (non-ZK) sumcheck prove over a synthetic random
 * instance of size 2^log_n, for comparison against the WebGPU sumcheck. Builds
 * random prover polynomials, runs SumcheckProver::prove(), and returns the elapsed
 * prove time. Witness validity is irrelevant — the relations run regardless.
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
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(log_n);
    bool operator==(const SumcheckBench&) const = default;
};

} // namespace bb::bbapi
