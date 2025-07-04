#pragma once
/**
 * @file bbrpc.hpp
 * @brief Barretenberg RPC provides a stateful API for all core barretenberg proving functions.
 * Not included:
 * - Solidity verifier generation
 * - Raw cryptography functions exposed by WASM BB
 */
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include <map>

namespace bb::bbrpc {

/**
 * @struct CircuitInputNoVK
 * @brief A circuit to be used in either ultrahonk or chonk (ClientIVC+honk) verification key derivation.
 */
struct CircuitInputNoVK {
    /**
     * @brief Human-readable name for the circuit
     *
     * This name is not used for processing but serves as a debugging aid and
     * provides context for circuit identification in logs and diagnostics.
     */
    std::string name;

    /**
     * @brief Serialized bytecode representation of the circuit
     *
     * Contains the ACIR program in serialized form. The format (bincode or msgpack)
     * is determined by examining the first byte of the bytecode.
     */
    std::vector<uint8_t> bytecode;
};

/**
 * @struct CircuitInput
 * @brief A circuit to be used in either ultrahonk or ClientIVC-honk proving.
 */
struct CircuitInput {
    /**
     * @brief Human-readable name for the circuit
     *
     * This name is not used for processing but serves as a debugging aid and
     * provides context for circuit identification in logs and diagnostics.
     */
    std::string name;

    /**
     * @brief Serialized bytecode representation of the circuit
     *
     * Contains the ACIR program in serialized form. The format (bincode or msgpack)
     * is determined by examining the first byte of the bytecode.
     */
    std::vector<uint8_t> bytecode;

    /**
     * @brief Verification key of the circuit. This could be derived, but it is more efficient to have it fixed ahead of
     * time. As well, this guards against unexpected changes in the verification key.
     */
    std::vector<uint8_t> verification_key;
};

struct ProofSystemSettings {
    /**
     * @brief Optional flag to indicate if the proof should be generated with IPA accumulation (i.e. for rollup
     * circuits).
     */
    bool ipa_accumulation = false;

    /**
     * @brief The oracle hash type to be used for the proof.
     *
     * This is used to determine the hash function used in the proof generation.
     * Valid values are "poseidon2", "keccak", and "starknet".
     */
    std::string oracle_hash_type = "poseidon2";

    /**
     * @brief Flag to disable blinding of the proof.
     * Useful for cases that don't require privacy, such as when all inputs are public or zk-SNARK proofs themselves.
     */
    bool disable_zk = false;

    /**
     * @brief Honk recursion setting.
     * 0 = no recursion, 1 = UltraHonk recursion, 2 = UltraRollupHonk recursion.
     * Controls whether pairing point accumulators and IPA claims are added to public inputs.
     */
    uint32_t honk_recursion = 0;

    /**
     * @brief Flag to indicate if this circuit will be recursively verified.
     */
    bool recursive = false;
};

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
        // Empty if successful.
        std::string error_message;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
};

struct CircuitComputeVk {
    static constexpr const char* NAME = "CircuitComputeVk";

    struct Response {
        static constexpr const char* NAME = "CircuitComputeVkResponse";

        /**
         * @brief Serialized verification key.
         */
        std::vector<uint8_t> verification_key;
        // Empty if successful.
        std::string error_message;
    };

    CircuitInputNoVK circuit;
    ProofSystemSettings settings;
};

/** Compute verification key, Treat the previously loaded circuit as either a standalone circuit
 * or a common final circuit used to verify all of IVC. */
struct CircuitComputeIvcVk {
    static constexpr const char* NAME = "CircuitComputeIvcVk";

    struct Response {
        static constexpr const char* NAME = "CircuitComputeIvcVkResponse";

        /**
         * @brief Serialized verification key.
         */
        std::vector<uint8_t> verification_key;
        // Empty if successful.
        std::string error_message;
    };
    bool standalone;
};

/** Compute verification key, Treat the previously loaded circuit as either a standalone circuit
 * or a common final circuit used to verify all of IVC. */
struct ClientIvcComputeVk {
    static constexpr const char* NAME = "ClientIvcComputeVk";

    struct Response {
        static constexpr const char* NAME = "ClientIvcComputeVkResponse";

        /**
         * @brief Serialized verification key.
         */
        std::vector<uint8_t> verification_key;
        // Empty if successful.
        std::string error_message;
    };

    CircuitInputNoVK circuit;
    bool standalone;
};

/**
 * @brief
 * Note, only one IVC request can be made at a time for each batch_request.
 */
struct ClientIvcStart {
    static constexpr const char* NAME = "ClientIvcStart";

    struct Response {
        static constexpr const char* NAME = "ClientIvcStartResponse";

        // Empty if successful.
        std::string error_message;
    };
};

struct ClientIvcLoad {
    static constexpr const char* NAME = "ClientIvcLoad";

    struct Response {
        static constexpr const char* NAME = "ClientIvcLoadResponse";

        // Empty if successful.
        std::string error_message;
    };

    CircuitInput circuit;
};

struct ClientIvcAccumulate {
    static constexpr const char* NAME = "ClientIvcAccumulate";

    struct Response {
        static constexpr const char* NAME = "ClientIvcAccumulateResponse";

        // Empty if successful.
        std::string error_message;
    };

    // Serialized witness for the last loaded circuit.
    std::vector<uint8_t> witness;
};

struct ClientIvcProve {
    static constexpr const char* NAME = "ClientIvcProve";

    struct Response {
        static constexpr const char* NAME = "ClientIvcProveResponse";

        ClientIVC::Proof proof;
        // Empty if successful.
        std::string error_message;
    };
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
        // Optional: gate counts per opcode
        std::map<std::string, uint32_t> gates_per_opcode;
        // Empty if successful.
        std::string error_message;
    };

    CircuitInput circuit;
    bool include_gates_per_opcode = false;
    ProofSystemSettings settings;
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
        // Empty if successful, contains constraint failure details if not satisfied.
        std::string error_message;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
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
        // Empty if successful.
        std::string error_message;
    };

    std::vector<uint8_t> verification_key;
    PublicInputsVector public_inputs;
    HonkProof proof;
    ProofSystemSettings settings;
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
        // Empty if successful.
        std::string error_message;
    };

    HonkProof proof;
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
        // Empty if successful.
        std::string error_message;
    };

    std::vector<uint8_t> verification_key;
    bool is_mega_honk = false;
};

/**
 * @brief Command to generate Solidity verifier contract
 */
struct CircuitWriteSolidityVerifier {
    static constexpr const char* NAME = "CircuitWriteSolidityVerifier";

    struct Response {
        static constexpr const char* NAME = "CircuitWriteSolidityVerifierResponse";

        std::string solidity_code;
        std::string error_message;
    };

    std::vector<uint8_t> verification_key;
    ProofSystemSettings settings;
};

/**
 * @brief Command to prove and verify in one step
 */
struct CircuitProveAndVerify {
    static constexpr const char* NAME = "CircuitProveAndVerify";

    struct Response {
        static constexpr const char* NAME = "CircuitProveAndVerifyResponse";

        bool verified;
        std::vector<bb::fr> proof;         // The generated proof
        std::vector<bb::fr> public_inputs; // Extracted public inputs
        std::string error_message;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
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
        std::string error_message;
    };

    CircuitInput circuit;
    std::string format = "binary"; // binary, hex, base64
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
        std::string error_message;
    };

    CircuitInput circuit;
    ProofSystemSettings settings;
    bool check_recursive_structure = false;
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
        std::string error_message;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    uint32_t num_iterations = 1;
    bool benchmark_witness_generation = true;
    bool benchmark_proving = true;
};

/**
 * @brief Command to check if a precomputed VK matches the circuit
 */
struct ClientIvcCheckPrecomputedVk {
    static constexpr const char* NAME = "ClientIvcCheckPrecomputedVk";

    struct Response {
        static constexpr const char* NAME = "ClientIvcCheckPrecomputedVkResponse";

        bool valid;
        std::string error_message;
    };

    // Circuit with its precomputed VK
    CircuitInput circuit;
    std::string function_name;
};

using Command = NamedUnion<CircuitProve,
                           CircuitComputeVk,
                           CircuitInfo,
                           CircuitCheck,
                           CircuitVerify,
                           ClientIvcComputeVk,
                           ClientIvcStart,
                           ClientIvcLoad,
                           ClientIvcAccumulate,
                           ClientIvcProve,
                           ProofAsFields,
                           VkAsFields,
                           CircuitWriteSolidityVerifier,
                           CircuitProveAndVerify,
                           CircuitWriteBytecode,
                           CircuitValidate,
                           CircuitBenchmark,
                           ClientIvcCheckPrecomputedVk>;

using CommandResponse = NamedUnion<CircuitProve::Response,
                                   CircuitComputeVk::Response,
                                   CircuitInfo::Response,
                                   CircuitCheck::Response,
                                   CircuitVerify::Response,
                                   ClientIvcComputeVk::Response,
                                   ClientIvcStart::Response,
                                   ClientIvcLoad::Response,
                                   ClientIvcAccumulate::Response,
                                   ClientIvcProve::Response,
                                   ProofAsFields::Response,
                                   VkAsFields::Response,
                                   CircuitWriteSolidityVerifier::Response,
                                   CircuitProveAndVerify::Response,
                                   CircuitWriteBytecode::Response,
                                   CircuitValidate::Response,
                                   CircuitBenchmark::Response,
                                   ClientIvcCheckPrecomputedVk::Response>;

/**
 * @brief Convert oracle hash type string to enum for internal use
 */
enum class OracleHashType { POSEIDON2, KECCAK, STARKNET };

inline OracleHashType parse_oracle_hash_type(const std::string& type)
{
    if (type == "keccak") {
        return OracleHashType::KECCAK;
    }
    if (type == "starknet") {
        return OracleHashType::STARKNET;
    }
    return OracleHashType::POSEIDON2; // default
}

} // namespace bb::bbrpc
