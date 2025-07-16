#pragma once
/**
 * @file bbapi_client_ivc.hpp
 * @brief ClientIVC-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for ClientIVC (Client-side Incrementally Verifiable Computation)
 * operations including circuit loading, accumulation, proving, and verification key computation.
 */
#include "barretenberg/api/bbapi_shared.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include <vector>

namespace bb::bbapi {

/**
 * @brief Helper function to compute verification key for IVC
 * @param request The API request context
 * @param num_public_inputs_in_final_circuit Number of public inputs in the final circuit
 * @return The computed IVC verification key
 */
ClientIVC::VerificationKey compute_civc_vk(const BBApiRequest& request, size_t num_public_inputs_in_final_circuit);

/**
 * @struct ClientIvcStart
 * @brief Initialize a new ClientIVC instance for incremental proof accumulation
 *
 * @note Only one IVC request can be made at a time for each batch_request.
 */
struct ClientIvcStart {
    static constexpr const char* NAME = "ClientIvcStart";

    /**
     * @struct Response
     * @brief Empty response indicating successful initialization
     */
    struct Response {
        static constexpr const char* NAME = "ClientIvcStartResponse";
        // Empty response - success indicated by no exception
    };
    // Number of circuits to be accumulated.
    size_t num_circuits;
    Response execute(BBApiRequest& request) &&;
};

/**
 * @struct ClientIvcLoad
 * @brief Load a circuit into the ClientIVC instance for accumulation
 */
struct ClientIvcLoad {
    static constexpr const char* NAME = "ClientIvcLoad";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit loading
     */
    struct Response {
        static constexpr const char* NAME = "ClientIvcLoadResponse";
        // Empty response - success indicated by no exception
    };

    /** @brief Circuit to be loaded with its bytecode and verification key */
    CircuitInput circuit;
    Response execute(BBApiRequest& request) &&;
};

/**
 * @struct ClientIvcAccumulate
 * @brief Accumulate the previously loaded circuit into the IVC proof
 */
struct ClientIvcAccumulate {
    static constexpr const char* NAME = "ClientIvcAccumulate";

    /**
     * @struct Response
     * @brief Empty response indicating successful circuit accumulation
     */
    struct Response {
        static constexpr const char* NAME = "ClientIvcAccumulateResponse";
        // Empty response - success indicated by no exception
    };

    /** @brief Serialized witness data for the last loaded circuit */
    std::vector<uint8_t> witness;
    Response execute(BBApiRequest& request) &&;
};

/**
 * @struct ClientIvcProve
 * @brief Generate a proof for all accumulated circuits
 */
struct ClientIvcProve {
    static constexpr const char* NAME = "ClientIvcProve";

    /**
     * @struct Response
     * @brief Contains the generated IVC proof
     */
    struct Response {
        static constexpr const char* NAME = "ClientIvcProveResponse";

        /** @brief Complete IVC proof for all accumulated circuits */
        ClientIVC::Proof proof;
    };
    Response execute(BBApiRequest& request) &&;
};

/**
 * @struct ClientIvcComputeStandaloneVk
 * @brief Compute standalone verification key for a circuit
 */
struct ClientIvcComputeStandaloneVk {
    static constexpr const char* NAME = "ClientIvcComputeStandaloneVk";

    /**
     * @struct Response
     * @brief Contains the computed verification key in multiple formats
     */
    struct Response {
        static constexpr const char* NAME = "ClientIvcComputeStandaloneVkResponse";

        /** @brief Serialized verification key in binary format */
        std::vector<uint8_t> bytes;
        /** @brief Verification key as array of field elements */
        std::vector<bb::fr> fields;
    };

    /** @brief Circuit bytecode without precomputed VK */
    CircuitInputNoVK circuit;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct ClientIvcComputeIvcVk
 * @brief Compute IVC verification key for the complete proof
 */
struct ClientIvcComputeIvcVk {
    static constexpr const char* NAME = "ClientIvcComputeIvcVk";

    /**
     * @struct Response
     * @brief Contains the computed IVC verification key
     */
    struct Response {
        static constexpr const char* NAME = "ClientIvcComputeIvcVkResponse";

        /** @brief Serialized IVC verification key in binary format */
        std::vector<uint8_t> bytes;
    };

    /** @brief Final circuit bytecode for IVC VK computation */
    CircuitInputNoVK circuit;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct ClientIvcCheckPrecomputedVk
 * @brief Verify that a precomputed verification key matches the circuit
 */
struct ClientIvcCheckPrecomputedVk {
    static constexpr const char* NAME = "ClientIvcCheckPrecomputedVk";

    /**
     * @struct Response
     * @brief Contains the validation result
     */
    struct Response {
        static constexpr const char* NAME = "ClientIvcCheckPrecomputedVkResponse";

        /** @brief True if the precomputed VK matches the circuit */
        bool valid;
    };

    /** @brief Circuit with its precomputed verification key */
    CircuitInput circuit;
    /** @brief Human-readable name for logging and error messages */
    std::string function_name;
    Response execute(const BBApiRequest& request = {}) &&;
};

} // namespace bb::bbapi
