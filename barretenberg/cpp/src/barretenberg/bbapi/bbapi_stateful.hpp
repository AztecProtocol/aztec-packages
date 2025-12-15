#pragma once
/**
 * @file bbapi_stateful.hpp
 * @brief Stateful proving key caching for UltraHonk flavors.
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
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include <span>
#include <vector>

namespace bb::bbapi {

/**
 * @brief Polynomial data for deserialization (owning).
 */
struct PolynomialExport {
    std::vector<bb::fr> coefficients;
    uint64_t start_index;
    uint64_t virtual_size;

    MSGPACK_FIELDS(coefficients, start_index, virtual_size);
};

/**
 * @brief Polynomial view for serialization (non-owning, zero-copy).
 */
struct PolynomialExportView {
    std::span<const bb::fr> coefficients;
    uint64_t start_index;
    uint64_t virtual_size;

    template <typename Packer> void msgpack_pack(Packer& pk) const
    {
        pk.pack_array(3);
        pk.pack_array(static_cast<uint32_t>(coefficients.size()));
        for (const auto& coeff : coefficients) {
            pk.pack(coeff);
        }
        pk.pack(start_index);
        pk.pack(virtual_size);
    }
};

/**
 * @brief Proving key data for deserialization (owning).
 */
struct DeciderProvingKeyExport {
    std::vector<PolynomialExport> polynomials;
    std::vector<bb::fr> public_inputs;
    bb::RelationParameters<bb::fr> relation_parameters;
    std::vector<bb::fr> gate_challenges;
    bb::fr target_sum;
    bool is_structured;
    uint64_t dyadic_size;
    uint64_t num_public_inputs;
    uint64_t pub_inputs_offset;
    uint64_t overflow_size;
    uint64_t final_active_wire_idx;
    std::vector<uint8_t> bytecode_hash;
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
 * @brief Proving key view for serialization (non-owning, zero-copy).
 */
struct DeciderProvingKeyExportView {
    std::vector<PolynomialExportView> polynomials;
    std::span<const bb::fr> public_inputs;
    bb::RelationParameters<bb::fr> relation_parameters;
    std::span<const bb::fr> gate_challenges;
    bb::fr target_sum;
    bool is_structured;
    uint64_t dyadic_size;
    uint64_t num_public_inputs;
    uint64_t pub_inputs_offset;
    uint64_t overflow_size;
    uint64_t final_active_wire_idx;
    std::span<const uint8_t> bytecode_hash;
    std::span<const uint32_t> memory_read_records;
    std::span<const uint32_t> memory_write_records;

    // Custom msgpack serialization - zero-copy, serializes directly from views
    template <typename Packer> void msgpack_pack(Packer& pk) const
    {
        pk.pack_array(14);

        // Pack polynomials array
        pk.pack_array(static_cast<uint32_t>(polynomials.size()));
        for (const auto& poly : polynomials) {
            poly.msgpack_pack(pk);
        }

        // Pack public_inputs
        pk.pack_array(static_cast<uint32_t>(public_inputs.size()));
        for (const auto& pi : public_inputs) {
            pk.pack(pi);
        }

        pk.pack(relation_parameters);

        // Pack gate_challenges
        pk.pack_array(static_cast<uint32_t>(gate_challenges.size()));
        for (const auto& gc : gate_challenges) {
            pk.pack(gc);
        }

        pk.pack(target_sum);
        pk.pack(is_structured);
        pk.pack(dyadic_size);
        pk.pack(num_public_inputs);
        pk.pack(pub_inputs_offset);
        pk.pack(overflow_size);
        pk.pack(final_active_wire_idx);

        // Pack bytecode_hash
        pk.pack_array(static_cast<uint32_t>(bytecode_hash.size()));
        for (const auto& b : bytecode_hash) {
            pk.pack(b);
        }

        // Pack memory_read_records
        pk.pack_array(static_cast<uint32_t>(memory_read_records.size()));
        for (const auto& r : memory_read_records) {
            pk.pack(r);
        }

        // Pack memory_write_records
        pk.pack_array(static_cast<uint32_t>(memory_write_records.size()));
        for (const auto& w : memory_write_records) {
            pk.pack(w);
        }
    }
};

/**
 * @brief Extract and serialize proving key from circuit (zero-copy).
 */
template <typename Flavor>
std::vector<uint8_t> get_proving_key_serialized(const CircuitInput& circuit, const ProofSystemSettings& /*settings*/)
{
    using ProverInstance = ProverInstance_<Flavor>;
    using CircuitBuilder = typename Flavor::CircuitBuilder;

    // Compute bytecode hash for cache validation
    auto bytecode_hash_arr = blake3::blake3s(circuit.bytecode);

    // Build proving key from circuit
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::vector<uint8_t>(circuit.bytecode)) };
    auto builder = acir_format::create_circuit<CircuitBuilder>(program);
    auto prover_instance = std::make_shared<ProverInstance>(builder);

    DeciderProvingKeyExportView export_view;

    for (const auto& poly : prover_instance->polynomials.get_precomputed()) {
        export_view.polynomials.push_back(
            PolynomialExportView{ .coefficients = std::span<const bb::fr>(poly.data(), poly.size()),
                                  .start_index = poly.start_index(),
                                  .virtual_size = poly.virtual_size() });
    }

    export_view.public_inputs = std::span<const bb::fr>(prover_instance->public_inputs);
    export_view.relation_parameters = prover_instance->relation_parameters;
    export_view.gate_challenges = std::span<const bb::fr>(prover_instance->gate_challenges);
    export_view.dyadic_size = prover_instance->dyadic_size();
    export_view.num_public_inputs = prover_instance->num_public_inputs();
    export_view.pub_inputs_offset = prover_instance->pub_inputs_offset();
    export_view.final_active_wire_idx = prover_instance->get_final_active_wire_idx();
    export_view.bytecode_hash = std::span<const uint8_t>(bytecode_hash_arr);
    export_view.memory_read_records = std::span<const uint32_t>(prover_instance->memory_read_records);
    export_view.memory_write_records = std::span<const uint32_t>(prover_instance->memory_write_records);

    msgpack::sbuffer buffer;
    msgpack::pack(buffer, export_view);
    return std::vector<uint8_t>(buffer.data(), buffer.data() + buffer.size());
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
    // Use flavor-specific constants for correct public input size
    size_t num_inner_public_inputs = [&]() {
        size_t num_public_inputs = instance->num_public_inputs();
        if constexpr (HasIPAAccumulator<Flavor>) {
            // UltraRollup includes both pairing points and IPA claim
            constexpr size_t ROLLUP_SPECIAL_SIZE = RollupIO::PUBLIC_INPUTS_SIZE;
            BB_ASSERT(num_public_inputs >= ROLLUP_SPECIAL_SIZE,
                      "Public inputs should contain pairing points and IPA claim.");
            return num_public_inputs - ROLLUP_SPECIAL_SIZE;
        } else {
            // Standard Ultra flavors only have pairing points
            constexpr size_t DEFAULT_SPECIAL_SIZE = DefaultIO::PUBLIC_INPUTS_SIZE;
            BB_ASSERT(num_public_inputs >= DEFAULT_SPECIAL_SIZE,
                      "Public inputs should contain a pairing point accumulator.");
            return num_public_inputs - DEFAULT_SPECIAL_SIZE;
        }
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
