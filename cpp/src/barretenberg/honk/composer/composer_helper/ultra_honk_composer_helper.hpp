#pragma once

#include "barretenberg/proof_system/composer/composer_helper_lib.hpp"
#include "barretenberg/plonk/composer/composer_helper/composer_helper_lib.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "barretenberg/plonk/proof_system/proving_key/proving_key.hpp"
#include "barretenberg/honk/proof_system/ultra_prover.hpp"
#include "barretenberg/honk/proof_system/ultra_verifier.hpp"

#include <cstddef>
#include <memory>
#include <utility>
#include <vector>

namespace proof_system::honk {
template <UltraFlavor Flavor> class UltraHonkComposerHelper_ {
  public:
    using CircuitConstructor = typename Flavor::CircuitConstructor;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using PCSParams = typename Flavor::PCSParams;
    using PCS = typename Flavor::PCS;
    using PCSCommitmentKey = typename PCSParams::CommitmentKey;
    using PCSVerificationKey = typename PCSParams::VerificationKey;

    static constexpr size_t NUM_RESERVED_GATES = 4; // equal to the number of multilinear evaluations leaked
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

    // This variable controls the amount with which the lookup table and witness values need to be shifted
    // above to make room for adding randomness into the permutation and witness polynomials in the plookup widget.
    // This must be (num_roots_cut_out_of_the_vanishing_polynomial - 1), since the variable num_roots_cut_out_of_
    // vanishing_polynomial cannot be trivially fetched here, I am directly setting this to 4 - 1 = 3.
    static constexpr size_t s_randomness = 3;

    explicit UltraHonkComposerHelper_(std::shared_ptr<srs::factories::CrsFactory> crs_factory)
        : crs_factory_(std::move(crs_factory))
    {}

    UltraHonkComposerHelper_(std::shared_ptr<ProvingKey> p_key, std::shared_ptr<VerificationKey> v_key)
        : proving_key(std::move(p_key))
        , verification_key(std::move(v_key))
    {}

    UltraHonkComposerHelper_(UltraHonkComposerHelper_&& other) noexcept = default;
    UltraHonkComposerHelper_(UltraHonkComposerHelper_ const& other) noexcept = default;
    UltraHonkComposerHelper_& operator=(UltraHonkComposerHelper_&& other) noexcept = default;
    UltraHonkComposerHelper_& operator=(UltraHonkComposerHelper_ const& other) noexcept = default;
    ~UltraHonkComposerHelper_() = default;

    void finalize_circuit(CircuitConstructor& circuit_constructor) { circuit_constructor.finalize_circuit(); };

    std::shared_ptr<ProvingKey> compute_proving_key(const CircuitConstructor& circuit_constructor);
    std::shared_ptr<VerificationKey> compute_verification_key(const CircuitConstructor& circuit_constructor);

    void compute_witness(CircuitConstructor& circuit_constructor);

    UltraProver_<Flavor> create_prover(CircuitConstructor& circuit_constructor);
    UltraVerifier_<Flavor> create_verifier(const CircuitConstructor& circuit_constructor);

    void add_table_column_selector_poly_to_proving_key(polynomial& small, const std::string& tag);

    void compute_commitment_key(size_t circuit_size, std::shared_ptr<srs::factories::CrsFactory> crs_factory)
    {
        commitment_key = std::make_shared<typename PCSParams::CommitmentKey>(circuit_size, crs_factory_);
    };
};
extern template class UltraHonkComposerHelper_<honk::flavor::Ultra>;
extern template class UltraHonkComposerHelper_<honk::flavor::UltraGrumpkin>;
using UltraHonkComposerHelper = UltraHonkComposerHelper_<honk::flavor::Ultra>;
} // namespace proof_system::honk
