#pragma once

#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"

#include <cstddef>
#include <memory>
#include <utility>
#include <vector>
namespace proof_system::honk {
template <UltraFlavor Flavor> class Instance {
    using CircuitBuilder = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using FF = typename Flavor::Curve::FF;
    using FoldingParameters = typename Flavor::FoldingParameters;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    // offset due to placing zero wires at the start of execution trace
    static constexpr size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;

    static constexpr std::string_view NAME_STRING = "UltraHonk";
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;
    std::shared_ptr<ProvingKey> proving_key;
    std::shared_ptr<VerificationKey> verification_key;

    std::shared_ptr<ProverPolynomials> prover_polynomials;
    std::shared_ptr<std::vector<FF>> public_inputs;

    std::vector<uint32_t> recursive_proof_public_input_indices;
    bool contains_recursive_proof = false;
    bool computed_witness = false;
    size_t total_num_gates = 0; // num_gates + num_pub_inputs + tables + zero_row_offset (used to compute dyadic size)
    size_t dyadic_circuit_size = 0; // final power-of-2 circuit size
    size_t lookups_size = 0;        // total number of lookup gates
    size_t tables_size = 0;         // total number of table entries
    size_t num_public_inputs = 0;
    size_t num_ecc_op_gates = 0;

    FoldingParameters folding_params;

    Instance(const CircuitBuilder& circuit)
    {
        compute_circuit_size_parameters(circuit);
        compute_proving_key(circuit);
        compute_witness(circuit);
        compute_verification_key(circuit);
    }

    Instance(std::shared_ptr<ProvingKey> p_key, std::shared_ptr<VerificationKey> v_key)
        : proving_key(std::move(p_key))
        , verification_key(std::move(v_key))
    {}

    Instance(Instance&& other) noexcept = default;
    Instance(Instance const& other) noexcept = default;
    Instance& operator=(Instance&& other) noexcept = default;
    Instance& operator=(Instance const& other) noexcept = default;
    ~Instance() = default;

    std::shared_ptr<ProvingKey> compute_proving_key(const CircuitBuilder& circuit);
    std::shared_ptr<VerificationKey> compute_verification_key(const CircuitBuilder& circuit);

    void compute_circuit_size_parameters(CircuitBuilder& circuit);

    void compute_witness(CircuitBuilder& circuit);

    void construct_ecc_op_wire_polynomials(auto&);

    void add_table_column_selector_poly_to_proving_key(barretenberg::polynomial& small, const std::string& tag);
};
} // namespace proof_system::honk