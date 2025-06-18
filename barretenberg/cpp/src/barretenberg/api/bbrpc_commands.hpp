#pragma once
/**
 * @file bbrpc.hpp
 * @brief Barretenberg RPC provides a stateful API for all core barretenberg proving functions.
 * Not included:
 * - Solidity verifier generation
 * - Raw cryptography functions exposed by WASM BB
 */
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "bbrpc_common.hpp"

namespace bb::bbrpc {

/**
 * @struct CircuitLoad
 * @brief Represents a request to load a circuit into the BB RPC state.
 *
 * Takes an ID, name and the circuit bytecode.
 */
struct CircuitLoad {
    /**
     * @brief Unique identifier for the circuit
     *
     * A 128-bit identifier designed to support UUID format (16 random bytes chosen by the client).
     * The client sets this ID to avoid waiting for barretenberg to assign one, enabling
     * operations to be queued that reference the circuit before loading is complete.
     */
    CircuitId circuit_id;

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
 * @struct CircuitDrop
 * @brief Represents a request to remove a circuit from the BB RPC state.
 *
 * Deallocate resources associated with a previously loaded circuit.
 * If the circuit is not found, the operation is a no-op but prints a warning to stderr.
 */
struct CircuitDrop {
    /**
     * @brief Unique identifier of the circuit to be dropped
     *
     * Must match the circuit_id of a previously loaded circuit. After this
     * operation, the circuit will no longer be available for use.
     */
    CircuitId circuit_id;
};

// if (flags.ipa_accumulation) {
//     _write(_prove<UltraRollupFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
// } else if (flags.oracle_hash_type == "poseidon2") {
//     _write(_prove<UltraFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
// } else if (flags.oracle_hash_type == "keccak" && !flags.zk) {
//     _write(_prove<UltraKeccakFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
// } else if (flags.oracle_hash_type == "keccak" && flags.zk) {
//     _write(_prove<UltraKeccakZKFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
// #ifdef STARKNET_GARAGA_FLAVORS
// } else if (flags.oracle_hash_type == "starknet" && !flags.zk) {
//     _write(_prove<UltraStarknetFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
// } else if (flags.oracle_hash_type == "starknet" && flags.zk) {
//     _write(_prove<UltraStarknetZKFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
// #endif
// }

/**
 * @struct CircuitProve
 * @brief Represents a request to generate a proof using the UltraHonk proving system.
 * Currently, this is the only proving system supported by BB (after plonk was deprecated and removed).
 *
 * This structure is used to encapsulate all necessary parameters for generating a proof
 * for a specific circuit, including the circuit ID, witness data, and options for the proving process.
 * This is not used for ClientIVC honk, which has a differently structured output and
 */
struct CircuitProve {
    /**
     * @brief Contains proof and public inputs.
     * Both are given as vectors of fields. To be used for verification.
     * Example uses would be verification in native BB, WASM BB, solidity or recursively through Noir.
     */
    using Response = PublicInputsAndProof;

    /**
     * @brief Unique identifier of the circuit to be used for proving
     *
     * This ID must match a previously loaded circuit. The proof will be generated
     * using the circuit's bytecode and parameters.
     */
    CircuitId circuit_id;

    std::vector<uint8_t> witness;

    /************************
     * PROOF SYSTEM SETTINGS
     ************************/
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
};

/**
 * @brief
 * Note, only one IVC request can be made at a time for each batch_request.
 */
struct ClientIvcStart {};

struct ClientIvcProve {};

struct ClientIvcAccumulate {
    /**
     * @brief Unique identifier of the circuit to be used for proving
     *
     * This ID must match a previously loaded circuit. The proof will be generated
     * using the circuit's bytecode and parameters.
     */
    CircuitId circuit_id;

    /**
     * @brief Serialized input data for the circuit
     *
     * Contains the inputs required for the proving process, serialized in a format
     * compatible with the circuit's expected input structure.
     */
    std::vector<uint8_t> inputs;
};

} // namespace bb::bbrpc
