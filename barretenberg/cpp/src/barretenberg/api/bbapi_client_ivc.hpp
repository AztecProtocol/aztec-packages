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

ClientIVC::VerificationKey compute_vk_for_ivc(const BBApiRequest& request, size_t num_public_inputs_in_final_circuit);

/**
 * @brief
 * Note, only one IVC request can be made at a time for each batch_request.
 */
struct ClientIvcStart {
    static constexpr const char* NAME = "ClientIvcStart";

    struct Response {
        static constexpr const char* NAME = "ClientIvcStartResponse";
        // Empty response - success indicated by no exception
    };
    Response execute(BBApiRequest& request) &&;
};

struct ClientIvcLoad {
    static constexpr const char* NAME = "ClientIvcLoad";

    struct Response {
        static constexpr const char* NAME = "ClientIvcLoadResponse";
        // Empty response - success indicated by no exception
    };

    CircuitInput circuit;
    Response execute(BBApiRequest& request) &&;
};

struct ClientIvcAccumulate {
    static constexpr const char* NAME = "ClientIvcAccumulate";

    struct Response {
        static constexpr const char* NAME = "ClientIvcAccumulateResponse";
        // Empty response - success indicated by no exception
    };

    // Serialized witness for the last loaded circuit.
    std::vector<uint8_t> witness;
    Response execute(BBApiRequest& request) &&;
};

struct ClientIvcProve {
    static constexpr const char* NAME = "ClientIvcProve";

    struct Response {
        static constexpr const char* NAME = "ClientIvcProveResponse";

        ClientIVC::Proof proof;
    };
    Response execute(BBApiRequest& request) &&;
};

/** Compute standalone verification key for a circuit */
struct ClientIvcComputeStandaloneVk {
    static constexpr const char* NAME = "ClientIvcComputeStandaloneVk";

    struct Response {
        static constexpr const char* NAME = "ClientIvcComputeStandaloneVkResponse";

        std::vector<uint8_t> bytes; // Serialized verification key
        std::vector<bb::fr> fields; // Verification key as field elements
    };

    CircuitInputNoVK circuit;
    Response execute(const BBApiRequest& request = {}) &&;
};

/** Compute IVC verification key */
struct ClientIvcComputeIvcVk {
    static constexpr const char* NAME = "ClientIvcComputeIvcVk";

    struct Response {
        static constexpr const char* NAME = "ClientIvcComputeIvcVkResponse";

        std::vector<uint8_t> bytes; // Serialized IVC verification key
    };

    CircuitInputNoVK circuit;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @brief Command to check if a precomputed VK matches the circuit
 */
struct ClientIvcCheckPrecomputedVk {
    static constexpr const char* NAME = "ClientIvcCheckPrecomputedVk";

    struct Response {
        static constexpr const char* NAME = "ClientIvcCheckPrecomputedVkResponse";

        bool valid;
    };

    // Circuit with its precomputed VK
    CircuitInput circuit;
    std::string function_name;
    Response execute(const BBApiRequest& request = {}) &&;
};

} // namespace bb::bbapi
