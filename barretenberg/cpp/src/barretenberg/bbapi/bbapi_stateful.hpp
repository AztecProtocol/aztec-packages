#pragma once
/**
 * @file bbapi_stateful.hpp
 * @brief Generic abstraction for stateful proving key hydration and proving.
 *
 * This file contains templated structures and functions to support stateful keygen
 * across different flavors (Ultra, UltraZK, Mega, MegaZK).
 */

#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include <vector>

namespace bb::bbapi {

/**
 * @brief Serializable polynomial data for proving key export.
 * @details Captures all metadata needed to reconstruct a polynomial:
 *   - coefficients: The actual coefficient data
 *   - start_index: The starting index of the memory-backed range (used for shifts)
 *   - virtual_size: The total logical size of the polynomial
 */
struct PolynomialExport {
    std::vector<bb::fr> coefficients;
    uint64_t start_index;
    uint64_t virtual_size;

    MSGPACK_FIELDS(coefficients, start_index, virtual_size);
};

/**
 * @brief Serializable proving key data generic over Flavor.
 * @details Contains circuit-specific precomputed data that can becached and reused.
 * Matches the structure of Flavor::PrecomputedEntities.
 */
struct DeciderProvingKeyExport {
    std::vector<PolynomialExport> polynomials;
    std::vector<bb::fr> public_inputs; // Can be empty if not part of PK
    bb::RelationParameters<bb::fr> relation_parameters;
    std::vector<bb::fr> gate_challenges;
    bb::fr target_sum;
    bool is_structured;
    uint64_t dyadic_size;
    uint64_t num_public_inputs;
    uint64_t pub_inputs_offset;
    uint64_t overflow_size;
    uint64_t final_active_wire_idx;
    // Bytecode hash for cache validation
    std::vector<uint8_t> bytecode_hash;
    // Memory records for RAM/ROM lookup arguments
    std::vector<uint32_t> memory_read_records;
    std::vector<uint32_t> memory_write_records;

    MSGPACK_FIELDS(polynomials,
                   public_inputs,
                   relation_parameters,
                   gate_challenges,
                   target_sum,
                   is_structured,
                   dyadic_size,
                   num_public_inputs,
                   pub_inputs_offset,
                   overflow_size,
                   final_active_wire_idx,
                   bytecode_hash,
                   memory_read_records,
                   memory_write_records);
};

/**
 * @brief Generic implementation of proving key extraction and export.
 * @tparam Flavor The proving system flavor (e.g. UltraFlavor, UltraZKFlavor)
 * @param circuit The circuit input containing bytecode
 * @param settings Proof system settings (unused but kept for API consistency)
 * @return Serializable proving key data with bytecode hash
 *
 * @details Extracts precomputed polynomials and metadata from a ProverInstance,
 * packages them into a DeciderProvingKeyExport structure, and computes a
 * bytecode hash for cache validation.
 */
template <typename Flavor>
DeciderProvingKeyExport get_proving_key(const CircuitInput& circuit, const ProofSystemSettings& /*settings*/)
{
    using ProverInstance = ProverInstance_<Flavor>;
    using CircuitBuilder = typename Flavor::CircuitBuilder;

    // Compute bytecode hash for cache validation
    auto bytecode_hash_arr = blake3::blake3s(circuit.bytecode);
    std::vector<uint8_t> bytecode_hash_vec(bytecode_hash_arr.begin(), bytecode_hash_arr.end());

    // Build proving key from circuit
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::vector<uint8_t>(circuit.bytecode)) };
    auto builder = acir_format::create_circuit<CircuitBuilder>(program);
    auto prover_instance = std::make_shared<ProverInstance>(builder);

    // Export proving key data
    DeciderProvingKeyExport export_data;

    // Extract precomputed polynomials
    for (auto& poly : prover_instance->polynomials.get_precomputed()) {
        PolynomialExport poly_export;
        poly_export.coefficients = std::vector<bb::fr>(poly.data(), poly.data() + poly.size());
        poly_export.start_index = poly.start_index();
        poly_export.virtual_size = poly.virtual_size();
        export_data.polynomials.push_back(std::move(poly_export));
    }

    // Extract metadata
    export_data.public_inputs = prover_instance->public_inputs;
    export_data.relation_parameters = prover_instance->relation_parameters;
    export_data.gate_challenges = prover_instance->gate_challenges;
    export_data.dyadic_size = prover_instance->dyadic_size();
    export_data.num_public_inputs = prover_instance->num_public_inputs();
    export_data.pub_inputs_offset = prover_instance->pub_inputs_offset();
    export_data.final_active_wire_idx = prover_instance->get_final_active_wire_idx();
    export_data.bytecode_hash = std::move(bytecode_hash_vec);
    export_data.memory_read_records = prover_instance->memory_read_records;
    export_data.memory_write_records = prover_instance->memory_write_records;

    return export_data;
}

template <typename Flavor>
std::vector<uint8_t> prove_with_pk(const CircuitInput& circuit,
                                   const std::vector<uint8_t>& witness,
                                   const std::vector<uint8_t>& proving_key,
                                   const ProofSystemSettings& /*settings*/)
{
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using CircuitBuilder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>; // UltraProver handles both Ultra and ZK flavors if template arguments match

    // Compute bytecode hash for cache validation
    auto current_bytecode_hash = blake3::blake3s(circuit.bytecode);

    // Deserialize proving key
    DeciderProvingKeyExport pk_data;
    msgpack::object_handle oh = msgpack::unpack((const char*)proving_key.data(), proving_key.size());
    msgpack::object obj = oh.get();
    obj.convert(pk_data);

    // Validate bytecode hash matches proving key
    bool hash_matches =
        (pk_data.bytecode_hash.size() == current_bytecode_hash.size()) &&
        std::equal(pk_data.bytecode_hash.begin(), pk_data.bytecode_hash.end(), current_bytecode_hash.begin());

    if (!hash_matches) {
        throw_or_abort("AcirProveWithPk: Bytecode hash mismatch. "
                       "The proving key was generated for a different circuit. "
                       "Please regenerate the proving key with the current bytecode.");
    }

    // Reconstruct circuit from bytecode and witness
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::vector<uint8_t>(circuit.bytecode)) };
    program.witness = acir_format::witness_buf_to_witness_vector(std::vector<uint8_t>(witness));
    // Note: Assuming UltraCircuitBuilder is compatible with the Flavor's builder requirement
    // For Mega, we might need MegaCircuitBuilder. Flavor::CircuitBuilder handles this.
    auto builder = acir_format::create_circuit<CircuitBuilder>(program);

    // Reconstruct metadata from proving key
    MetaData metadata;
    metadata.dyadic_size = static_cast<size_t>(pk_data.dyadic_size);
    metadata.num_public_inputs = static_cast<size_t>(pk_data.num_public_inputs);
    metadata.pub_inputs_offset = static_cast<size_t>(pk_data.pub_inputs_offset);

    // Convert PolynomialExport to ProverInstance::PolynomialData
    std::vector<typename ProverInstance::PolynomialData> poly_data_vec;
    poly_data_vec.reserve(pk_data.polynomials.size());
    for (auto& poly_export : pk_data.polynomials) {
        typename ProverInstance::PolynomialData poly_data;
        poly_data.coefficients = std::move(poly_export.coefficients);
        poly_data.start_index = static_cast<size_t>(poly_export.start_index);
        poly_data.virtual_size = static_cast<size_t>(poly_export.virtual_size);
        poly_data_vec.push_back(std::move(poly_data));
    }

    // HYDRATION: Create ProverInstance using precomputed polynomials from proving key
    auto instance = std::make_shared<ProverInstance>(builder,
                                                     std::move(poly_data_vec),
                                                     metadata,
                                                     static_cast<size_t>(pk_data.final_active_wire_idx),
                                                     std::move(pk_data.memory_read_records),
                                                     std::move(pk_data.memory_write_records));

    // Construct verification key and prove
    auto verification_key = std::make_shared<VerificationKey>(instance->get_precomputed());
    Prover prover{ instance, verification_key };

    auto proof = prover.construct_proof();

    // Calculate inner public inputs (excluding pairing point accumulator)
    size_t num_inner_public_inputs = [&]() {
        size_t num_public_inputs = instance->num_public_inputs();
        // Assuming PAIRING_POINT_SIZE is standard across flavors for now
        // UltraFlavor uses DefaultIO::PUBLIC_INPUTS_SIZE = 16
        constexpr size_t PAIRING_POINT_SIZE = 16;
        BB_ASSERT(num_public_inputs >= PAIRING_POINT_SIZE, "Public inputs should contain a pairing point accumulator.");
        return num_public_inputs - PAIRING_POINT_SIZE;
    }();

    // Create the combined result [num_inputs][inputs...][proof...]
    std::vector<uint8_t> result_vec;
    size_t total_size = 4 + (num_inner_public_inputs * 32) + (proof.size() * 32);
    result_vec.resize(total_size);

    uint8_t* ptr = result_vec.data();

    // Pack num_inner_public_inputs (4 bytes, big endian)
    uint32_t num_pub_inputs_be = htonl(static_cast<uint32_t>(num_inner_public_inputs));
    std::memcpy(ptr, &num_pub_inputs_be, 4);
    ptr += 4;

    // Pack inner public inputs (first N elements of proof)
    for (size_t i = 0; i < num_inner_public_inputs; ++i) {
        bb::fr::serialize_to_buffer(proof[i], ptr);
        ptr += 32;
    }

    // Pack proof (remaining elements)
    for (size_t i = num_inner_public_inputs; i < proof.size(); ++i) {
        bb::fr::serialize_to_buffer(proof[i], ptr);
        ptr += 32;
    }

    return result_vec;
}

} // namespace bb::bbapi
