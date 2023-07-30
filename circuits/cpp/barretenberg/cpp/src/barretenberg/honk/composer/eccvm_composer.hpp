#pragma once

#include "barretenberg/honk/proof_system/eccvm_prover.hpp"
#include "barretenberg/honk/proof_system/eccvm_verifier.hpp"
#include "barretenberg/proof_system/circuit_builder/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"

namespace proof_system::honk {
template <ECCVMFlavor Flavor> class ECCVMComposerHelper_ {
  public:
    using CircuitConstructor = ECCVMCircuitConstructor<Flavor>;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using PCSParams = typename Flavor::PCSParams;
    using PCS = typename Flavor::PCS;
    using PCSCommitmentKey = typename PCSParams::CommitmentKey;
    using PCSVerificationKey = typename PCSParams::VerificationKey;

    static constexpr std::string_view NAME_STRING = "ECCVM";
    static constexpr size_t NUM_RESERVED_GATES = 0; // equal to the number of multilinear evaluations leaked
    static constexpr size_t NUM_WIRES = CircuitConstructor::NUM_WIRES;
    std::shared_ptr<ProvingKey> proving_key;
    std::shared_ptr<VerificationKey> verification_key;

    // The crs_factory holds the path to the srs and exposes methods to extract the srs elements
    std::shared_ptr<srs::factories::CrsFactory> crs_factory_;

    // The commitment key is passed to the prover but also used herein to compute the verfication key commitments
    std::shared_ptr<PCSCommitmentKey> commitment_key;

    std::vector<uint32_t> recursive_proof_public_input_indices;
    bool contains_recursive_proof = false;
    bool computed_witness = false;

    ECCVMComposerHelper_()
        : crs_factory_(barretenberg::srs::get_crs_factory()){};

    explicit ECCVMComposerHelper_(std::shared_ptr<srs::factories::CrsFactory> crs_factory)
        : crs_factory_(std::move(crs_factory))
    {}

    ECCVMComposerHelper_(std::shared_ptr<ProvingKey> p_key, std::shared_ptr<VerificationKey> v_key)
        : proving_key(std::move(p_key))
        , verification_key(std::move(v_key))
    {}

    ECCVMComposerHelper_(ECCVMComposerHelper_&& other) noexcept = default;
    ECCVMComposerHelper_(ECCVMComposerHelper_ const& other) noexcept = default;
    ECCVMComposerHelper_& operator=(ECCVMComposerHelper_&& other) noexcept = default;
    ECCVMComposerHelper_& operator=(ECCVMComposerHelper_ const& other) noexcept = default;
    ~ECCVMComposerHelper_() = default;

    std::shared_ptr<ProvingKey> compute_proving_key(CircuitConstructor& circuit_constructor);
    std::shared_ptr<VerificationKey> compute_verification_key(CircuitConstructor& circuit_constructor);

    void compute_witness(CircuitConstructor& circuit_constructor);

    ECCVMProver_<Flavor> create_prover(CircuitConstructor& circuit_constructor);
    ECCVMVerifier_<Flavor> create_verifier(CircuitConstructor& circuit_constructor);

    void add_table_column_selector_poly_to_proving_key(polynomial& small, const std::string& tag);

    void compute_commitment_key(size_t circuit_size)
    {
        commitment_key = std::make_shared<typename PCSParams::CommitmentKey>(circuit_size, crs_factory_);
    };
};
extern template class ECCVMComposerHelper_<honk::flavor::ECCVM>;
// TODO(#532): this pattern is weird; is this not instantiating the templates?
using ECCVMComposerHelper = ECCVMComposerHelper_<honk::flavor::ECCVM>;
} // namespace proof_system::honk
