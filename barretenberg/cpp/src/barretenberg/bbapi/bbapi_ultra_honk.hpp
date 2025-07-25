#pragma once
/**
 * @file bbapi_ultra_honk.hpp
 * @brief UltraHonk-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for UltraHonk proof system operations
 * including circuit proving, verification, VK computation, and utility functions.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/serialize/msgpack.hpp"
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
    static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitProve";

    /**
     * @brief Contains proof and public inputs.
     * Both are given as vectors of fields. To be used for verification.
     * Example uses of this Response would be verification in native BB, WASM BB, solidity or recursively through Noir.
     */
    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitProveResponse";

        PublicInputsVector public_inputs;
        HonkProof proof;
        MSGPACK_FIELDS(public_inputs, proof);
        bool operator==(const Response&) const = default;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(circuit, witness, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitProve&) const = default;
};

struct CircuitComputeVk {
    static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitComputeVk";

    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitComputeVkResponse";

        std::vector<uint8_t> bytes; // Serialized verification key
        MSGPACK_FIELDS(bytes);
        bool operator==(const Response&) const = default;
    };

    CircuitInputNoVK circuit;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(circuit, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitComputeVk&) const = default;
};

/**
 * @struct CircuitInfo
 * @brief Consolidated command for retrieving circuit information.
 * Combines gate count, circuit size, and other metadata into a single command.
 */
struct CircuitInfo {
    static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitInfo";

    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitInfoResponse";

        uint32_t total_gates;
        uint32_t subgroup_size;
        std::map<std::string, uint32_t> gates_per_opcode; // Optional: gate counts per opcode
        MSGPACK_FIELDS(total_gates, subgroup_size, gates_per_opcode);
        bool operator==(const Response&) const = default;
    };

    CircuitInput circuit;
    bool include_gates_per_opcode = false;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(circuit, include_gates_per_opcode, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitInfo&) const = default;
};

/**
 * @struct CircuitCheck
 * @brief Verify that a witness satisfies a circuit's constraints.
 * For debugging and validation purposes.
 */
struct CircuitCheck {
    static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitCheck";

    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitCheckResponse";

        bool satisfied;
        MSGPACK_FIELDS(satisfied);
        bool operator==(const Response&) const = default;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(circuit, witness, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitCheck&) const = default;
};

/**
 * @struct CircuitVerify
 * @brief Verify a proof against a verification key and public inputs.
 */
struct CircuitVerify {
    static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitVerify";

    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitVerifyResponse";

        bool verified;
        MSGPACK_FIELDS(verified);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    PublicInputsVector public_inputs;
    HonkProof proof;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(verification_key, public_inputs, proof, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitVerify&) const = default;
};

/**
 * @struct ProofAsFields
 * @brief Convert a proof to field elements representation.
 */
struct ProofAsFields {
    static constexpr const char* MSGPACK_SCHEMA_NAME = "ProofAsFields";

    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "ProofAsFieldsResponse";

        std::vector<bb::fr> fields;
        MSGPACK_FIELDS(fields);
        bool operator==(const Response&) const = default;
    };

    HonkProof proof;
    MSGPACK_FIELDS(proof);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const ProofAsFields&) const = default;
};

/**
 * @struct VkAsFields
 * @brief Convert a verification key to field elements representation.
 */
struct VkAsFields {
    static constexpr const char* MSGPACK_SCHEMA_NAME = "VkAsFields";

    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "VkAsFieldsResponse";

        std::vector<bb::fr> fields;
        MSGPACK_FIELDS(fields);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    bool is_mega_honk = false;
    MSGPACK_FIELDS(verification_key, is_mega_honk);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const VkAsFields&) const = default;
};

/**
 * @brief Command to generate Solidity verifier contract
 */
struct CircuitWriteSolidityVerifier {
    static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitWriteSolidityVerifier";

    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitWriteSolidityVerifierResponse";

        std::string solidity_code;
        MSGPACK_FIELDS(solidity_code);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(verification_key, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitWriteSolidityVerifier&) const = default;
};

/**
 * @brief Command to prove and verify in one step
 */
struct CircuitProveAndVerify {
    static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitProveAndVerify";

    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitProveAndVerifyResponse";

        bool verified;
        HonkProof proof;
        PublicInputsVector public_inputs;
        MSGPACK_FIELDS(verified, proof, public_inputs);
        bool operator==(const Response&) const = default;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(circuit, witness, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitProveAndVerify&) const = default;
};

/**
 * @brief Command to benchmark circuit operations
 */
struct CircuitBenchmark {
    static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitBenchmark";

    struct Response {
        static constexpr const char* MSGPACK_SCHEMA_NAME = "CircuitBenchmarkResponse";

        double witness_generation_time_ms;
        double proving_time_ms;
        double verification_time_ms;
        uint64_t peak_memory_bytes;
        MSGPACK_FIELDS(witness_generation_time_ms, proving_time_ms, verification_time_ms, peak_memory_bytes);
        bool operator==(const Response&) const = default;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    uint32_t num_iterations = 1;
    bool benchmark_witness_generation = true;
    bool benchmark_proving = true;
    MSGPACK_FIELDS(circuit, witness, settings, num_iterations, benchmark_witness_generation, benchmark_proving);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitBenchmark&) const = default;
};

// OracleHashType enum and parse_oracle_hash_type are defined in bbapi_shared.hpp

} // namespace bb::bbapi
