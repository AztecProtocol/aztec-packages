#pragma once
/**
 * @file bbapi_avm.hpp
 * @brief AVM-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for AVM operations including proving,
 * verification, and circuit checking. When built with bb (non-AVM), these
 * commands return an error response. When built with bb-avm, they work normally.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <string>
#include <vector>

namespace bb::bbapi {

/**
 * @struct AvmStat
 * @brief A single AVM per-stage timing entry. `value_ms` is wall-clock milliseconds captured by
 * bb::avm2::Stats during a prove or check-circuit call.
 */
struct AvmStat {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmStat";

    std::string name;
    uint64_t value_ms;
    SERIALIZATION_FIELDS(name, value_ms);
    bool operator==(const AvmStat&) const = default;
};

/**
 * @struct AvmProve
 * @brief Prove an AVM transaction from serialized inputs.
 * The inputs are opaque msgpack bytes of AvmProvingInputs. Callers should call AvmVerify
 * separately if they need to verify the resulting proof.
 */
struct AvmProve {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmProve";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmProveResponse";

        std::vector<bb::fr> proof;
        std::vector<AvmStat> stats;
        SERIALIZATION_FIELDS(proof, stats);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> inputs;
    SERIALIZATION_FIELDS(inputs);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const AvmProve&) const = default;
};

/**
 * @struct AvmVerify
 * @brief Verify an AVM proof against serialized public inputs.
 */
struct AvmVerify {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmVerify";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmVerifyResponse";

        bool verified;
        SERIALIZATION_FIELDS(verified);
        bool operator==(const Response&) const = default;
    };

    std::vector<bb::fr> proof;
    std::vector<uint8_t> public_inputs;
    SERIALIZATION_FIELDS(proof, public_inputs);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const AvmVerify&) const = default;
};

/**
 * @struct AvmCheckCircuit
 * @brief Check the AVM circuit from serialized inputs.
 */
struct AvmCheckCircuit {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmCheckCircuit";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmCheckCircuitResponse";

        bool passed;
        std::vector<AvmStat> stats;
        SERIALIZATION_FIELDS(passed, stats);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> inputs;
    SERIALIZATION_FIELDS(inputs);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const AvmCheckCircuit&) const = default;
};

} // namespace bb::bbapi
