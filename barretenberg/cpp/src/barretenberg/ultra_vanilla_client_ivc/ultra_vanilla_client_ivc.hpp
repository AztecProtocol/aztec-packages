#pragma once

#include "barretenberg/plonk_honk_shared/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <algorithm>
namespace bb {

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

  public:
    std::shared_ptr<CommitmentKey<curve::BN254>> commitment_key;
    Proof previous_proof;
    std::shared_ptr<VK> previous_vk;
    Accumulator accumulator;
    PairingPointAccumulatorIndices accumulator_indices;

    UltraVanillaClientIVC(const size_t dyadic_size = 1 << 20)
        : commitment_key(std::make_shared<CommitmentKey<curve::BN254>>(dyadic_size))
    {}

    void accumulate(Circuit&, const Proof&, const std::shared_ptr<VK>&);

    HonkProof prove(std::vector<Circuit>, std::vector<std::optional<std::shared_ptr<VK>>>);

    static bool verify(const Proof&, const std::shared_ptr<VK>&);

    bool prove_and_verify(std::vector<Circuit>, std::vector<std::optional<std::shared_ptr<VK>>>);
};
} // namespace bb