#pragma once
/**
 * @file bbapi_chonk.hpp
 * @brief SumcheckChonk-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for SumcheckChonk (Client-side Incrementally Verifiable Computation)
 * operations including circuit loading, accumulation, proving, and verification key computation.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/chonk/sumcheck_chonk.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <vector>

namespace bb::bbapi {

/**
 * @struct ChonkStart
 * @brief Initialize a new SumcheckChonk instance for incremental proof accumulation
 *
 * @note Only one IVC request can be made at a time for each batch_request.
 */
struct ChonkStart {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkStart";

    /**
     * @struct Response
     * @brief Empty response indicating successful initialization
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkStartResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    // Number of circuits to be accumulated.
    size_t num_circuits;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(num_circuits);
    bool operator==(const ChonkStart&) const = default;
};

/**
 * @struct ChonkLoad
 * @brief Load a circuit into the SumcheckChonk instance for accumulation
 */
struct ChonkLoad {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkLoad";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit loading
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkLoadResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    /** @brief Circuit to be loaded with its bytecode and verification key */
    CircuitInput circuit;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(circuit);
    bool operator==(const ChonkLoad&) const = default;
};

/**
 * @struct ChonkAccumulate
 * @brief Accumulate the previously loaded circuit into the IVC proof
 */
struct ChonkAccumulate {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkAccumulate";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit accumulation
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkAccumulateResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };

    /** @brief Serialized witness data for the last loaded circuit */
    std::vector<uint8_t> witness;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(witness);
    bool operator==(const ChonkAccumulate&) const = default;
};

/**
 * @struct ChonkProve
 * @brief Generate a proof for all accumulated circuits
 */
struct ChonkProve {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkProve";

    /**
     * @struct Response
     * @brief Contains the generated IVC proof
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkProveResponse";

        /** @brief Complete IVC proof for all accumulated circuits */
        SumcheckChonk::Proof proof;
        MSGPACK_FIELDS(proof);
        bool operator==(const Response&) const = default;
    };
    Response execute(BBApiRequest& request) &&;
    void msgpack(auto&& pack_fn) { pack_fn(); }
    bool operator==(const ChonkProve&) const = default;
};

/**
 * @struct ChonkVerify
 * @brief Verify a SumcheckChonk proof with its verification key
 */
struct ChonkVerify {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkVerify";

    /**
     * @struct Response
     * @brief Contains the verification result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkVerifyResponse";

        /** @brief True if the proof is valid */
        bool valid;
        MSGPACK_FIELDS(valid);
        bool operator==(const Response&) const = default;
    };

    /** @brief The SumcheckChonk proof to verify */
    SumcheckChonk::Proof proof;
    /** @brief The verification key */
    std::vector<uint8_t> vk;
    Response execute(const BBApiRequest& request = {}) &&;
    MSGPACK_FIELDS(proof, vk);
    bool operator==(const ChonkVerify&) const = default;
};

/**
 * @struct ChonkComputeStandaloneVk
 * @brief Compute standalone verification key for a circuit
 */
struct ChonkComputeStandaloneVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkComputeStandaloneVk";

    /**
     * @struct Response
     * @brief Contains the computed verification key in multiple formats
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkComputeStandaloneVkResponse";

        /** @brief Serialized verification key in binary format */
        std::vector<uint8_t> bytes;
        /** @brief Verification key as array of field elements */
        std::vector<bb::fr> fields;
        MSGPACK_FIELDS(bytes, fields);
        bool operator==(const Response&) const = default;
    };

    CircuitInputNoVK circuit;
    Response execute([[maybe_unused]] const BBApiRequest& request = {}) &&;
    MSGPACK_FIELDS(circuit);
    bool operator==(const ChonkComputeStandaloneVk&) const = default;
};

/**
 * @struct ChonkComputeIvcVk
 * @brief Compute IVC verification key for the complete proof
 */
struct ChonkComputeIvcVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkComputeIvcVk";

    /**
     * @struct Response
     * @brief Contains the computed IVC verification key
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkComputeIvcVkResponse";

        /** @brief Serialized IVC verification key in binary format */
        std::vector<uint8_t> bytes;
        MSGPACK_FIELDS(bytes);
        bool operator==(const Response&) const = default;
    };

    CircuitInputNoVK circuit;
    Response execute(const BBApiRequest& request = {}) &&;
    MSGPACK_FIELDS(circuit);
    bool operator==(const ChonkComputeIvcVk&) const = default;
};

/**
 * @struct ChonkCheckPrecomputedVk
 * @brief Verify that a precomputed verification key matches the circuit
 */
struct ChonkCheckPrecomputedVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkCheckPrecomputedVk";

    /**
     * @struct Response
     * @brief Contains the validation result
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkCheckPrecomputedVkResponse";

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
    bool operator==(const ChonkCheckPrecomputedVk&) const = default;
};

/**
 * @struct ChonkStats
 * @brief Get gate counts for a circuit
 */
struct ChonkStats {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkStats";

    /**
     * @struct Response
     * @brief Contains gate count information
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ChonkStatsResponse";

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
    bool operator==(const ChonkStats&) const = default;
};

} // namespace bb::bbapi
