// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief The stdlib counterpart of VerifierInstance, used in recursive folding verification.
 */
template <IsRecursiveFlavor Flavor_> class RecursiveVerifierInstance_ {
  public:
    using Flavor = Flavor_;
    using FF = typename Flavor::FF;
    using NativeFF = typename Flavor::Curve::ScalarFieldNative;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using SubrelationSeparator = typename Flavor::SubrelationSeparator;
    using Builder = typename Flavor::CircuitBuilder;
    using NativeFlavor = typename Flavor::NativeFlavor;
    using NativeVerificationKey = typename Flavor::NativeFlavor::VerificationKey;
    using NativeVerifierInstance = bb::VerifierInstance_<NativeFlavor>;
    using Transcript = typename Flavor::Transcript;

    Builder* builder;

    std::shared_ptr<VKAndHash> vk_and_hash;

    bool is_complete = false;      // whether this instance has been completely populated
    std::vector<FF> public_inputs; // to be extracted from the corresponding proof

    // Single alpha challenge from which powers are computed for batching subrelations
    SubrelationSeparator alpha;
    RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;

    WitnessCommitments witness_commitments;

    // For ZK flavors: commitment to Gemini masking polynomial
    Commitment gemini_masking_commitment;

    // Constructor from stdlib vk and hash
    RecursiveVerifierInstance_(Builder* builder, std::shared_ptr<VKAndHash> vk_and_hash)
        : builder(builder)
        , vk_and_hash(vk_and_hash) {};

    /**
     * @brief Get the verification key
     * @return Verification key shared pointer
     */
    std::shared_ptr<VerificationKey> get_vk() const { return vk_and_hash->vk; }
};
} // namespace bb::stdlib::recursion::honk
