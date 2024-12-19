#pragma once

#include "barretenberg/plonk_honk_shared/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <algorithm>
namespace bb {

/**
 * @brief A function that produces a set of circuits and possibly their precomputed vks
 * @details One has the option of not providing vks--just provide nullptr instead.
 *    This class is introduced as an experiment. We _could_ just use vectors of vks and shared_ptrs, but this limits
 * applicability of the class because, in practice, we don't have sufficient memory to store all circuit builders at
 * once.  The idea is this class is applicable in both situations we care about testing via mocks (cf the test file for
 * UltraVanillaClientIVC, which implements a source of mock circuits), and IVC of circuits written in Noir, where the
 * source (not yet implemented) is ACIR and partial witnesses which are processed by our DSL code, expanding blackbox
 * function calls.
 * @todo Relocate this at the appropriate time, if it does become a standard interface.
 */
template <typename Flavor,
          typename Builder = typename Flavor::CircuitBuilder,
          typename VK = typename Flavor::VerificationKey>

class CircuitSource {
  public:
    struct Output {
        Builder circuit;
        std::shared_ptr<VK> vk;
    };

    virtual Output next();
    virtual size_t num_circuits() const;
};

/**
 * @brief A class encapsulating multiple sequential steps of the IVC scheme that arises most naturally from recursive
 * proof verification.
 *
 * @details "Vanilla" is in the colloquial sense of meaning "plain". "Client" refers to the fact that this is intended
 * for executing proof construction in constrained environments.
 */
class UltraVanillaClientIVC {

  public:
    using Flavor = UltraFlavor;
    using FF = Flavor::FF;
    using Circuit = UltraCircuitBuilder;
    using PK = DeciderProvingKey_<Flavor>;
    using VK = UltraFlavor::VerificationKey;
    using Proof = HonkProof;

    using RecursiveFlavor = UltraRecursiveFlavor_<Circuit>;
    using RecursiveVerifier = stdlib::recursion::honk::UltraRecursiveVerifier_<RecursiveFlavor>;
    using RecursiveVK = RecursiveFlavor::VerificationKey;
    using Curve = stdlib::bn254<Circuit>;
    using Accumulator = stdlib::recursion::aggregation_state<Curve>;

    /**
     * @brief Append a recursive verifier and update the accumulator.
     */
    void accumulate(Circuit&, const Proof&, const std::shared_ptr<VK>&);

  public:
    std::shared_ptr<CommitmentKey<curve::BN254>> commitment_key;
    Proof previous_proof;
    std::shared_ptr<VK> previous_vk;
    Accumulator accumulator;
    PairingPointAccumulatorIndices accumulator_indices;
    std::vector<std::shared_ptr<VK>> vk_cache;

    UltraVanillaClientIVC(const size_t dyadic_size = 1 << 20)
        : commitment_key(std::make_shared<CommitmentKey<curve::BN254>>(dyadic_size))
    {}

    /**
     * @brief Iterate through all circuits and prove each, appending a recursive verifier of the previous proof after
     * the first step.
     * @param source A source of circuits, possibly accompanied by precomputed verification keys.
     * @param cache_vks If true, case the verification key that is computed.
     * @return HonkProof A proof of the final circuit which through recursive verification, demonstrates that all
     * circuits were satisfied, or one of them was not satisfied, depending on whether it verifies or does not verify.
     */
    HonkProof prove(CircuitSource<Flavor>& source, const bool cache_vks = false);

    /**
     * @brief Verify an IVC proof.
     * @details This is here for a consistent interface, but it's a mere convenience--the function just wraps UltraHonk
     * verification.
     *
     * @param proof
     * @param vk
     * @return true All circuits provided have been satisfied.
     * @return false Some circuit provided was not satisfied.
     */
    static bool verify(const Proof& proof, const std::shared_ptr<VK>& vk);

    /**
     * @brief Prove and then verify the proof. This is used for testing.
     */
    bool prove_and_verify(CircuitSource<Flavor>& source, const bool cache_vks = false);

    /**
     * @brief Compute the verification key of each circuit provided by the source.
     * @details This runs a full IVC prover. Our public interface provides a faster but more brittle method via dummy
     * witnesses. This is a useful fallback that we might want for debugging. Currently it is used to test the prover
     * flow that using precomputed verification keys.
     */
    std::vector<std::shared_ptr<VK>> compute_vks(CircuitSource<Flavor>& source);
};
} // namespace bb