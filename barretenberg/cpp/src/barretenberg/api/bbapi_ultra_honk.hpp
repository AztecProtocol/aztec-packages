#pragma once
/**
 * @file bbapi_ultra_honk.hpp
 * @brief UltraHonk-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for UltraHonk proof system operations
 * including circuit proving, verification, VK computation, and utility functions.
 */
#include "barretenberg/api/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include <map>
#include <vector>

namespace bb::bbapi {

// CircuitInput, CircuitInputNoVK, and ProofSystemSettings are defined in bbapi_shared.hpp

/**
 * @struct CircuitProve
 * @brief Represents a request to generate a proof.
 * Currently, UltraHonk is the only proving system supported by BB (after plonk was deprecated and removed).
 * This is used for one-shot proving, not our "IVC" scheme, ClientIVC-honk. For that, use the ClientIVC* commands.
 *
 * This structure is used to encapsulate all necessary parameters for generating a proof
 * for a specific circuit, including the circuit bytecode, verification key, witness data, and options for the proving
 * process.
 */
struct CircuitProve {
    static constexpr const char* NAME = "CircuitProve";

    /**
     * @brief Contains proof and public inputs.
     * Both are given as vectors of fields. To be used for verification.
     * Example uses of this Response would be verification in native BB, WASM BB, solidity or recursively through Noir.
     */
    struct Response {
        static constexpr const char* NAME = "CircuitProveResponse";

        PublicInputsVector public_inputs;
        HonkProof proof;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
};

struct CircuitComputeVk {
    static constexpr const char* NAME = "CircuitComputeVk";

    struct Response {
        static constexpr const char* NAME = "CircuitComputeVkResponse";

        std::vector<uint8_t> bytes; // Serialized verification key
    };

    CircuitInputNoVK circuit;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) const;
};

/** Compute verification key, Treat the previously loaded circuit as either a standalone circuit
 * or a common final circuit used to verify all of IVC. */
struct CircuitComputeIvcVk {
    static constexpr const char* NAME = "CircuitComputeIvcVk";

    struct Response {
        static constexpr const char* NAME = "CircuitComputeIvcVkResponse";

        std::vector<uint8_t> bytes; // Serialized verification key
    };
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @struct CircuitInfo
 * @brief Consolidated command for retrieving circuit information.
 * Combines gate count, circuit size, and other metadata into a single command.
 */
struct CircuitInfo {
    static constexpr const char* NAME = "CircuitInfo";

    struct Response {
        static constexpr const char* NAME = "CircuitInfoResponse";

        uint32_t total_gates;
        uint32_t subgroup_size;
        std::map<std::string, uint32_t> gates_per_opcode; // Optional: gate counts per opcode
    };

    CircuitInput circuit;
    bool include_gates_per_opcode = false;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @struct CircuitCheck
 * @brief Verify that a witness satisfies a circuit's constraints.
 * For debugging and validation purposes.
 */
struct CircuitCheck {
    static constexpr const char* NAME = "CircuitCheck";

    struct Response {
        static constexpr const char* NAME = "CircuitCheckResponse";

        bool satisfied;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @struct CircuitVerify
 * @brief Verify a proof against a verification key and public inputs.
 */
struct CircuitVerify {
    static constexpr const char* NAME = "CircuitVerify";

    struct Response {
        static constexpr const char* NAME = "CircuitVerifyResponse";

        bool verified;
    };

    std::vector<uint8_t> verification_key;
    PublicInputsVector public_inputs;
    HonkProof proof;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @struct ProofAsFields
 * @brief Convert a proof to field elements representation.
 */
struct ProofAsFields {
    static constexpr const char* NAME = "ProofAsFields";

    struct Response {
        static constexpr const char* NAME = "ProofAsFieldsResponse";

        std::vector<bb::fr> fields;
    };

    HonkProof proof;
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @struct VkAsFields
 * @brief Convert a verification key to field elements representation.
 */
struct VkAsFields {
    static constexpr const char* NAME = "VkAsFields";

    struct Response {
        static constexpr const char* NAME = "VkAsFieldsResponse";

        std::vector<bb::fr> fields;
    };

    std::vector<uint8_t> verification_key;
    bool is_mega_honk = false;
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @brief Command to generate Solidity verifier contract
 */
struct CircuitWriteSolidityVerifier {
    static constexpr const char* NAME = "CircuitWriteSolidityVerifier";

    struct Response {
        static constexpr const char* NAME = "CircuitWriteSolidityVerifierResponse";

        std::string solidity_code;
    };

    std::vector<uint8_t> verification_key;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @brief Command to prove and verify in one step
 */
struct CircuitProveAndVerify {
    static constexpr const char* NAME = "CircuitProveAndVerify";

    struct Response {
        static constexpr const char* NAME = "CircuitProveAndVerifyResponse";

        bool verified;
        HonkProof proof;
        PublicInputsVector public_inputs;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @brief Command to write circuit bytecode in various formats
 */
struct CircuitWriteBytecode {
    static constexpr const char* NAME = "CircuitWriteBytecode";

    struct Response {
        static constexpr const char* NAME = "CircuitWriteBytecodeResponse";

        std::vector<uint8_t> bytecode;
        std::string formatted_output; // For hex/base64
    };

    CircuitInput circuit;
    std::string format = "binary"; // binary, hex, base64
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @brief Command to validate circuit structure
 */
struct CircuitValidate {
    static constexpr const char* NAME = "CircuitValidate";

    struct Response {
        static constexpr const char* NAME = "CircuitValidateResponse";

        bool is_valid;
        std::vector<std::string> validation_errors;
    };

    CircuitInput circuit;
    ProofSystemSettings settings;
    bool check_recursive_structure = false;
    Response execute(const BBApiRequest& request = {}) const;
};

/**
 * @brief Command to benchmark circuit operations
 */
struct CircuitBenchmark {
    static constexpr const char* NAME = "CircuitBenchmark";

    struct Response {
        static constexpr const char* NAME = "CircuitBenchmarkResponse";

        double witness_generation_time_ms;
        double proving_time_ms;
        double verification_time_ms;
        uint64_t peak_memory_bytes;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    uint32_t num_iterations = 1;
    bool benchmark_witness_generation = true;
    bool benchmark_proving = true;
    Response execute(const BBApiRequest& request = {}) const;
};

// OracleHashType enum and parse_oracle_hash_type are defined in bbapi_shared.hpp

} // namespace bb::bbapi
