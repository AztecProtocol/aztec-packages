

#pragma once

#include "barretenberg/proof_system/circuit_builder/generated/Fib_trace.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/vm/generated/Fib_prover.hpp"
#include "barretenberg/vm/generated/Fib_verifier.hpp"

namespace proof_system::honk {
template <typename Flavor> class FibComposer_ {
  public:
    using CircuitConstructor = FibTraceBuilder<Flavor>;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using PCS = typename Flavor::PCS;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;

    // TODO: which of these will we really need
    static constexpr std::string_view NAME_STRING = "Fib";
    static constexpr size_t NUM_RESERVED_GATES = 0;
    static constexpr size_t NUM_WIRES = Flavor::NUM_WIRES;

    std::shared_ptr<ProvingKey> proving_key;
    std::shared_ptr<VerificationKey> verification_key;

    // The crs_factory holds the path to the srs and exposes methods to extract the srs elements
    std::shared_ptr<barretenberg::srs::factories::CrsFactory<typename Flavor::Curve>> crs_factory_;

    // The commitment key is passed to the prover but also used herein to compute the verfication key commitments
    std::shared_ptr<CommitmentKey> commitment_key;

    std::vector<uint32_t> recursive_proof_public_input_indices;
    bool contains_recursive_proof = false;
    bool computed_witness = false;

    FibComposer_()
        requires(std::same_as<Flavor, honk::flavor::FibFlavor>)
    {
        crs_factory_ = barretenberg::srs::get_crs_factory();
    }

    FibComposer_(std::shared_ptr<ProvingKey> p_key, std::shared_ptr<VerificationKey> v_key)
        : proving_key(std::move(p_key))
        , verification_key(std::move(v_key))
    {}

    FibComposer_(FibComposer_&& other) noexcept = default;
    FibComposer_(FibComposer_ const& other) noexcept = default;
    FibComposer_& operator=(FibComposer_&& other) noexcept = default;
    FibComposer_& operator=(FibComposer_ const& other) noexcept = default;
    ~FibComposer_() = default;

    std::shared_ptr<ProvingKey> compute_proving_key(CircuitConstructor& circuit_constructor);
    std::shared_ptr<VerificationKey> compute_verification_key(CircuitConstructor& circuit_constructor);

    void compute_witness(CircuitConstructor& circuit_constructor);

    FibProver_<Flavor> create_prover(CircuitConstructor& circuit_constructor);
    FibVerifier_<Flavor> create_verifier(CircuitConstructor& circuit_constructor);

    void add_table_column_selector_poly_to_proving_key(barretenberg::polynomial& small, const std::string& tag);

    void compute_commitment_key(size_t circuit_size)
    {
        commitment_key = std::make_shared<CommitmentKey>(circuit_size, crs_factory_);
    };
};

extern template class FibComposer_<honk::flavor::FibFlavor>;
using FibComposer = FibComposer_<honk::flavor::FibFlavor>;

} // namespace proof_system::honk
