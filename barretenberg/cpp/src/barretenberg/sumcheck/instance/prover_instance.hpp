#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {
/**
 * @brief  A ProverInstance is normally constructed from a finalized circuit and it contains all the information
 * required by an Ultra Goblin Honk prover to create a proof. A ProverInstance is also the result of running the
 * Protogalaxy prover, in which case it becomes a relaxed counterpart with the folding parameters (target sum and gate
 * challenges set to non-zero values).
 *
 * @details This is the equivalent of ω in the paper.
 */

template <class Flavor> class ProverInstance_ {
    using Circuit = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Polynomial = typename Flavor::Polynomial;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationSeparator = typename Flavor::RelationSeparator;

  public:
    std::shared_ptr<ProvingKey> proving_key;

    ProverPolynomials prover_polynomials;
    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;

    std::array<Polynomial, 4> sorted_polynomials;

    // The number of public inputs has to be the same for all instances because they are
    // folded element by element.
    std::vector<FF> public_inputs;
    // offset due to placing zero wires at the start of execution trace
    // non-zero  for Instances constructed from circuits, this concept doesn't exist for accumulated
    // instances
    size_t pub_inputs_offset = 0;
    RelationSeparator alphas;
    bb::RelationParameters<FF> relation_parameters;
    std::vector<uint32_t> recursive_proof_public_input_indices;

    bool is_accumulator = false;

    // The folding parameters (\vec{β}, e) which are set for accumulators (i.e. relaxed instances).
    std::vector<FF> gate_challenges;
    FF target_sum;

    size_t instance_size;
    size_t log_instance_size;

    ProverInstance_(Circuit& circuit)
    {
        compute_circuit_size_parameters(circuit);
        compute_proving_key(circuit);
        compute_witness(circuit);
    }

    ProverInstance_() = default;
    ~ProverInstance_() = default;

    void initialize_prover_polynomials();

    void compute_sorted_accumulator_polynomials(FF);

    void compute_sorted_list_accumulator(FF);

    void compute_logderivative_inverse(FF, FF)
        requires IsGoblinFlavor<Flavor>;

    void compute_grand_product_polynomials(FF, FF);

  private:
    static constexpr size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;
    static constexpr size_t NUM_WIRES = Circuit::NUM_WIRES;
    bool contains_recursive_proof = false;
    bool computed_witness = false;
    size_t total_num_gates = 0; // num_gates + num_pub_inputs + tables + zero_row_offset (used to compute dyadic size)
    size_t dyadic_circuit_size = 0; // final power-of-2 circuit size
    size_t lookups_size = 0;        // total number of lookup gates
    size_t tables_size = 0;         // total number of table entries
    size_t num_public_inputs = 0;
    size_t num_ecc_op_gates = 0;

    std::shared_ptr<ProvingKey> compute_proving_key(Circuit&);

    void compute_circuit_size_parameters(Circuit&);

    void compute_witness(Circuit&);

    void construct_ecc_op_wire_polynomials(auto&);

    void construct_databus_polynomials(Circuit&)
        requires IsGoblinFlavor<Flavor>;

    void add_table_column_selector_poly_to_proving_key(bb::polynomial& small, const std::string& tag);

    void add_plookup_memory_records_to_wire_4(FF);
};

} // namespace bb
