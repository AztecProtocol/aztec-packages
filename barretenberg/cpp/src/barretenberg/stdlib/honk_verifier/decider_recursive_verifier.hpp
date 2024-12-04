#pragma once
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/protogalaxy_verifier/recursive_decider_verification_key.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb::stdlib::recursion::honk {
template <typename Flavor> class DeciderRecursiveVerifier_ {
    using NativeFlavor = typename Flavor::NativeFlavor;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Builder = typename Flavor::CircuitBuilder;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using PairingPoints = std::array<GroupElement, 2>;
    using RecursiveDeciderVK = RecursiveDeciderVerificationKey_<Flavor>;
    using NativeDeciderVK = bb::DeciderVerificationKey_<NativeFlavor>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;

  public:
    explicit DeciderRecursiveVerifier_(Builder* builder, std::shared_ptr<NativeDeciderVK> accumulator)
        : builder(builder)
        , accumulator(std::make_shared<RecursiveDeciderVK>(builder, accumulator)){};

    /**
     * @brief Construct a decider recursive verifier directly from a stdlib accumulator, returned by a prior iteration
     * of a recursive folding verifier. This is only appropriate when the two verifiers are part of the same builder,
     * otherwise the constructor above should be used which instantiatesn a recursive vk from a native one in the
     * verifier's builder context.
     *
     * @param builder
     * @param accumulator
     */
    explicit DeciderRecursiveVerifier_(Builder* builder, std::shared_ptr<RecursiveDeciderVK> accumulator)
        : builder(builder)
    {
        if (this->builder == accumulator->builder) {
            this->accumulator = std::move(accumulator);
        } else {
            this->accumulator = std::make_shared<RecursiveDeciderVK>(
                this->builder, std::make_shared<NativeDeciderVK>(accumulator->get_value()));
        }
    }

    PairingPoints verify_proof(const HonkProof& proof);

    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    Builder* builder;
    std::shared_ptr<RecursiveDeciderVK> accumulator;
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb::stdlib::recursion::honk