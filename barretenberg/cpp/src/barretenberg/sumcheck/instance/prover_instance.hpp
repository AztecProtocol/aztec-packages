#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"

namespace proof_system::honk {
/**
 * @brief  An Instance is normally constructed from a finalized circuit and it's role is to compute all the polynomials
 * involved in creating a proof and, if requested, the verification key.
 * In case of folded Instance, this will be created from the FoldingResult, the aggregated work from the folding prover
 * and verifier. More specifically, a folded instance will be constructed from the complete set of folded polynomials
 * and folded public inputs and its FoldingParams are expected to be non-zero
 *
 */
// TODO(https://github.com/AztecProtocol/barretenberg/issues/725): create an Instances class that manages several
// Instance and passes them to ProtoGalaxy prover and verifier so that Instance objects don't need to mantain an index
template <class Flavor> class ProverInstance_ {
    using Circuit = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using FF = typename Flavor::FF;
    using FoldingParameters = typename Flavor::FoldingParameters;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using Polynomial = typename Flavor::Polynomial;

  public:
    std::shared_ptr<ProvingKey> proving_key;
    std::shared_ptr<VerificationKey> verification_key;
    std::shared_ptr<CommitmentKey> commitment_key;

    ProverPolynomials prover_polynomials;

    // The number of public inputs has to be the same for all instances because they are
    // folded element by element.
    std::vector<FF> public_inputs;
    // offset due to placing zero wires at the start of execution trace
    // non-zero  for Instances constructed from circuits, this concept doesn't exist for accumulated
    // instances
    size_t pub_inputs_offset = 0;
    FF alpha;
    proof_system::RelationParameters<FF> relation_parameters;
    std::vector<uint32_t> recursive_proof_public_input_indices;
    // non-empty for the accumulated instances
    FoldingParameters folding_parameters;

    ProverInstance_(Circuit& circuit)
    {
        compute_circuit_size_parameters(circuit);
        compute_proving_key(circuit);
        compute_witness(circuit);
    }

    ProverInstance_(FoldingResult<Flavor> result)
        : verification_key(std::move(result.verification_key))
        , prover_polynomials(result.folded_prover_polynomials)
        , public_inputs(result.folded_public_inputs)
        , folding_parameters(result.folding_parameters){};

    ProverInstance_() = default;
    ~ProverInstance_() = default;

    std::shared_ptr<VerificationKey> compute_verification_key();

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

    void add_table_column_selector_poly_to_proving_key(barretenberg::polynomial& small, const std::string& tag);

    void add_plookup_memory_records_to_wire_4(FF);
};

extern template class ProverInstance_<honk::flavor::Ultra>;
extern template class ProverInstance_<honk::flavor::GoblinUltra>;

} // namespace proof_system::honk