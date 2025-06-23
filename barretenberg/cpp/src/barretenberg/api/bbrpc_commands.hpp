#pragma once
/**
 * @file bbrpc.hpp
 * @brief Barretenberg RPC provides a stateful API for all core barretenberg proving functions.
 * Not included:
 * - Solidity verifier generation
 * - Raw cryptography functions exposed by WASM BB
 */
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "bbrpc_common.hpp"
#include <map>

namespace bb::bbrpc {

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
     * @brief Verification key. Should always be passed, except for write_vk.
     */
    std::vector<uint8_t> verification_key;
};

struct ProofSystemSettings {
    /**
     * @brief Optional flag to indicate if the proof should be generated with IPA accumulation (i.e. for rollup
     * circuits).
     */
    bool ipa_accumulation;

    /**
     * @brief The oracle hash type to be used for the proof.
     *
     * This is used to determine the hash function used in the proof generation.
     * Valid values are "poseidon2", "keccak", and "starknet".
     */
    std::string oracle_hash_type;

    /**
     * @brief Flag to disable blinding of the proof.
     * Useful for cases that don't require privacy, such as when all inputs are public or zk-SNARK proofs themselves.
     */
    bool disable_zk;

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
    /**
     * @brief Contains proof and public inputs.
     * Both are given as vectors of fields. To be used for verification.
     * Example uses of this Response would be verification in native BB, WASM BB, solidity or recursively through Noir.
     */
    struct Response {
        PublicInputsVector public_inputs;
        HonkProof proof;
        // Empty if successful.
        std::string error_message;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
};

struct CircuitDeriveVk {
    struct Response {
        /**
         * @brief Serialized verification key.
         */
        std::vector<uint8_t> verification_key;
        // Empty if successful.
        std::string error_message;
    };

    CircuitInput circuit;
    ProofSystemSettings settings;
};

struct ClientIvcDeriveVk {
    struct Response {
        /**
         * @brief Serialized verification key.
         */
        std::vector<uint8_t> verification_key;
        // Empty if successful.
        std::string error_message;
    };

    CircuitInput circuit;
    bool standalone;
};

/**
 * @brief
 * Note, only one IVC request can be made at a time for each batch_request.
 */
struct ClientIvcStart {
    struct Response {
        // Empty if successful.
        std::string error_message;
    };
};

struct ClientIvcLoad {
    struct Response {
        // Empty if successful.
        std::string error_message;
    };

    CircuitInput circuit;
};

struct ClientIvcAccumulate {
    struct Response {
        // Empty if successful.
        std::string error_message;
    };

    // Serialized witness for the last loaded circuit.
    std::vector<uint8_t> witness;
};

struct ClientIvcProve {
    struct Response {
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
    struct Response {
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
    struct Response {
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
    struct Response {
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
    struct Response {
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
    struct Response {
        std::vector<bb::fr> fields;
        // Empty if successful.
        std::string error_message;
    };

    std::vector<uint8_t> verification_key;
    bool is_mega_honk = false;
};

using Command = std::variant<CircuitProve,
                             CircuitDeriveVk,
                             CircuitInfo,
                             CircuitCheck,
                             CircuitVerify,
                             ClientIvcDeriveVk,
                             ClientIvcStart,
                             ClientIvcLoad,
                             ClientIvcAccumulate,
                             ClientIvcProve,
                             ProofAsFields,
                             VkAsFields>;

using CommandResponse = std::variant<CircuitProve::Response,
                                     CircuitDeriveVk::Response,
                                     CircuitInfo::Response,
                                     CircuitCheck::Response,
                                     CircuitVerify::Response,
                                     ClientIvcDeriveVk::Response,
                                     ClientIvcStart::Response,
                                     ClientIvcLoad::Response,
                                     ClientIvcAccumulate::Response,
                                     ClientIvcProve::Response,
                                     ProofAsFields::Response,
                                     VkAsFields::Response>;

} // namespace bb::bbrpc
