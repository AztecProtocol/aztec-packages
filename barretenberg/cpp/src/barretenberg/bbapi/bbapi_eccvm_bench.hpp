#pragma once

#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <string>
#include <vector>

namespace bb::bbapi {

struct EccvmBenchMeasurement {
    std::string name;
    uint32_t log_size = 0;
    uint32_t run_index = 0;
    double ms = 0;
    uint32_t proof_bytes = 0;

    SERIALIZATION_FIELDS(name, log_size, run_index, ms, proof_bytes);
    bool operator==(const EccvmBenchMeasurement&) const = default;
};

struct EccvmBench {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "EccvmBench";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "EccvmBenchResponse";
        std::vector<EccvmBenchMeasurement> measurements;
        SERIALIZATION_FIELDS(measurements);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint32_t> log_sizes;
    uint32_t runs = 1;
    bool include_prove = true;
    bool include_sumcheck = true;

    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(log_sizes, runs, include_prove, include_sumcheck);
    bool operator==(const EccvmBench&) const = default;
};

} // namespace bb::bbapi
