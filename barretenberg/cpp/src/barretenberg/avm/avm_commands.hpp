#pragma once
/**
 * @file avm_commands.hpp
 * @brief NamedUnion command structs for the aztec-avm simulation API.
 *
 * Commands use opaque std::vector<uint8_t> for inputs/outputs since
 * AvmFastSimulationInputs and TxSimulationResult are large, complex types
 * with existing msgpack serialization.
 */

#include "barretenberg/serialize/msgpack.hpp"

#include <cstdint>
#include <string>
#include <vector>

namespace bb::avm {

// Forward declaration
struct AvmRequest;

// ---------------------------------------------------------------------------
// Simulation commands
// ---------------------------------------------------------------------------

struct AvmSimulate {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmSimulate";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmSimulateResponse";
        std::vector<uint8_t> result;
        SERIALIZATION_FIELDS(result);
        bool operator==(const Response&) const = default;
    };
    // Msgpack-serialized AvmFastSimulationInputs
    std::vector<uint8_t> inputs;
    SERIALIZATION_FIELDS(inputs);
    Response execute(AvmRequest& request) &&;
    bool operator==(const AvmSimulate&) const = default;
};

struct AvmSimulateWithHints {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmSimulateWithHints";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmSimulateWithHintsResponse";
        std::vector<uint8_t> result;
        SERIALIZATION_FIELDS(result);
        bool operator==(const Response&) const = default;
    };
    // Msgpack-serialized AvmProvingInputs
    std::vector<uint8_t> inputs;
    SERIALIZATION_FIELDS(inputs);
    Response execute(AvmRequest& request) &&;
    bool operator==(const AvmSimulateWithHints&) const = default;
};

struct AvmShutdown {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmShutdown";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmShutdownResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    void msgpack(auto&& pack_fn) { pack_fn(); }
    Response execute(AvmRequest& request) &&;
    bool operator==(const AvmShutdown&) const = default;
};

} // namespace bb::avm
