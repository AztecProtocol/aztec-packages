#pragma once
/**
 * @file bbapi_client_ivc.hpp
 * @brief ClientIVC-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for ClientIVC (Client-side Incrementally Verifiable Computation)
 * operations including circuit loading, accumulation, proving, and verification key computation.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <vector>

namespace bb::bbapi {

/**
 * @struct ClientIvcStart
 * @brief Initialize a new ClientIVC instance for incremental proof accumulation
 *
 * @note Only one IVC request can be made at a time for each batch_request.
 */
struct ClientIvcStart {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcStart";

    /**
     * @struct Response
     * @brief Empty response indicating successful initialization
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcStartResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    // Number of circuits to be accumulated.
    size_t num_circuits;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(num_circuits);
    bool operator==(const ClientIvcStart&) const = default;
};

/**
 * @struct ClientIvcLoad
 * @brief Load a circuit into the ClientIVC instance for accumulation
 */
struct ClientIvcLoad {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcLoad";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit loading
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcLoadResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    /** @brief Circuit to be loaded with its bytecode and verification key */
    CircuitInput circuit;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(circuit);
    bool operator==(const ClientIvcLoad&) const = default;
};

/**
 * @struct ClientIvcAccumulate
 * @brief Accumulate the previously loaded circuit into the IVC proof
 */
struct ClientIvcAccumulate {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcAccumulate";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit accumulation
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcAccumulateResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    /** @brief Serialized witness data for the last loaded circuit */
    std::vector<uint8_t> witness;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(witness);
    bool operator==(const ClientIvcAccumulate&) const = default;
};

/**
 * @struct ClientIvcProve
 * @brief Generate a proof for all accumulated circuits
 */
struct ClientIvcProve {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcProve";

    /**
     * @struct Response
     * @brief Contains the generated IVC proof
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcProveResponse";

        /** @brief Complete IVC proof for all accumulated circuits */
        ClientIVC::Proof proof;
        MSGPACK_FIELDS(proof);
        bool operator==(const Response&) const = default;
    };
    Response execute(BBApiRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const ClientIvcProve&) const = default;
};

/**
 * @struct ClientIvcVerify
 * @brief Verify a ClientIVC proof with its verification key
 */
struct ClientIvcVerify {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcVerify";

    /**
     * @struct Response
     * @brief Contains the verification result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcVerifyResponse";

        /** @brief True if the proof is valid */
        bool valid;
        MSGPACK_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    /** @brief The ClientIVC proof to verify */
    ClientIVC::Proof proof;
    /** @brief The verification key */
    std::vector<uint8_t> vk;
    Response execute(const BBApiRequest& request = {}) &&;
    MSGPACK_FIELDS(proof, vk);
    bool operator==(const ClientIvcVerify&) const = default;
};

/**
 * @struct ClientIvcComputeStandaloneVk
 * @brief Compute standalone verification key for a circuit
 */
struct ClientIvcComputeStandaloneVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcComputeStandaloneVk";

    /**
     * @struct Response
     * @brief Contains the computed verification key in multiple formats
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcComputeStandaloneVkResponse";

        /** @brief Serialized verification key in binary format */
        std::vector<uint8_t> bytes;
        /** @brief Verification key as array of field elements */
        std::vector<bb::fr> fields;
        MSGPACK_FIELDS(bytes, fields);
        bool operator==(const Response&) const = default;
    };

    CircuitInputNoVK circuit;
    Response execute(const BBApiRequest& request = {}) &&;
    MSGPACK_FIELDS(circuit);
    bool operator==(const ClientIvcComputeStandaloneVk&) const = default;
};

/**
 * @struct ClientIvcComputeIvcVk
 * @brief Compute IVC verification key for the complete proof
 */
struct ClientIvcComputeIvcVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcComputeIvcVk";

    /**
     * @struct Response
     * @brief Contains the computed IVC verification key
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcComputeIvcVkResponse";

        /** @brief Serialized IVC verification key in binary format */
        std::vector<uint8_t> bytes;
        MSGPACK_FIELDS(bytes);
        bool operator==(const Response&) const = default;
    };

    CircuitInputNoVK circuit;
    Response execute(const BBApiRequest& request = {}) &&;
    MSGPACK_FIELDS(circuit);
    bool operator==(const ClientIvcComputeIvcVk&) const = default;
};

/**
 * @struct ClientIvcCheckPrecomputedVk
 * @brief Verify that a precomputed verification key matches the circuit
 */
struct ClientIvcCheckPrecomputedVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcCheckPrecomputedVk";

    /**
     * @struct Response
     * @brief Contains the validation result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcCheckPrecomputedVkResponse";

        /** @brief True if the precomputed VK matches the circuit */
        bool valid;
        /** @brief The actual VK it should be. */
        std::vector<uint8_t> actual_vk;
        MSGPACK_FIELDS(valid, actual_vk);
        bool operator==(const Response&) const = default;
    };

    /** @brief Circuit with its precomputed verification key */
    CircuitInput circuit;

    Response execute(const BBApiRequest& request = {}) &&;
    MSGPACK_FIELDS(circuit);
    bool operator==(const ClientIvcCheckPrecomputedVk&) const = default;
};

/**
 * @struct ClientIvcStats
 * @brief Get gate counts for a circuit
 */
struct ClientIvcStats {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcStats";

    /**
     * @struct Response
     * @brief Contains gate count information
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ClientIvcStatsResponse";

        /** @brief Number of ACIR opcodes */
        uint32_t acir_opcodes;
        /** @brief Circuit size (total number of gates) */
        uint32_t circuit_size;
        /** @brief Optional: gate counts per opcode */
        std::vector<uint32_t> gates_per_opcode;
        MSGPACK_FIELDS(acir_opcodes, circuit_size, gates_per_opcode);
        bool operator==(const Response&) const = default;
    };

    /** @brief The circuit to analyze */
    CircuitInputNoVK circuit;
    /** @brief Whether to include detailed gate counts per opcode */
    bool include_gates_per_opcode;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(circuit, include_gates_per_opcode);
    bool operator==(const ClientIvcStats&) const = default;
};

} // namespace bb::bbapi
