// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"

#include <cstddef>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib::recursion::honk;
template <typename Builder> using field_ct = stdlib::field_t<Builder>;
template <typename Builder> using bn254 = stdlib::bn254<Builder>;
template <typename Builder> using PairingPoints = bb::stdlib::recursion::PairingPoints<Builder>;

template <typename Flavor>
HonkRecursionConstraintOutput<typename Flavor::CircuitBuilder> create_honk_recursion_constraints(
    typename Flavor::CircuitBuilder& builder, const RecursionConstraint& input)
    requires(IsRecursiveFlavor<Flavor> && IsUltraHonk<typename Flavor::NativeFlavor>)
{
    using Builder = typename Flavor::CircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using bool_ct = bb::stdlib::bool_t<Builder>;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVKAndHash = Flavor::VKAndHash;
    using RecursiveVerifier = bb::stdlib::recursion::honk::UltraRecursiveVerifier_<Flavor>;
    using IO = std::conditional_t<HasIPAAccumulator<Flavor>,
                                  stdlib::recursion::honk::RollupIO,
                                  stdlib::recursion::honk::DefaultIO<Builder>>;

    BB_ASSERT(input.proof_type == HONK || input.proof_type == HONK_ZK || input.proof_type == ROLLUP_HONK ||
                  input.proof_type == ROOT_ROLLUP_HONK,
              "create_honk_recursion_constraints: Only HONK, HONK_ZK, ROLLUP_HONK, ROOT_ROLLUP_HONK proof types are "
              "supported.");
    BB_ASSERT_EQ(input.proof_type == ROLLUP_HONK || input.proof_type == ROOT_ROLLUP_HONK,
                 HasIPAAccumulator<Flavor>,
                 "create_honk_recursion_constraints: ROLLUP_HONK and ROOT_ROLLUP_HONK must be recursively verified "
                 "using a Flavor with IPA accumulator.s");

    // Step 1.
    // Construct in-circuit representations of the recursion data
    std::vector<field_ct> vk_fields = fields_from_witnesses(builder, input.key);
    field_ct vk_hash = field_ct::from_witness_index(&builder, input.key_hash);
    std::vector<field_ct> proof_fields =
        fields_from_witnesses(builder, add_public_inputs_to_proof(input.proof, input.public_inputs));
    bool_ct predicate(to_field_ct(input.predicate, builder)); // Constructor enforces predicate = 0 or 1

    // Step 2. and 3.
    // Construct an Honk proof and vk with the correct number of public inputs.
    const auto [honk_proof, honk_vk] = construct_honk_proof_for_simple_circuit<typename Flavor::NativeFlavor>(
        /*acir_public_inputs_size=*/input.public_inputs.size());

    if (builder.is_write_vk_mode()) {
        // Set honk vk in builder
        populate_fields(builder, vk_fields, honk_vk->to_field_elements());

        // Set honk proof in builder
        populate_fields(builder, proof_fields, honk_proof);
    }

    if (!predicate.is_constant()) {
        // If the predicate is a witness, we conditionally assign a valid vk, proof and vk hash so that verification
        // suceeds. Note: in doing this, we create some new witnesses that are only used in the conditional assignment.
        // It would be optimal to hard-code these values in the selector, but due to the randomness needed to generate
        // valid ZK proofs, we cannot do that without adding a dependency of the VKs on the witness values. Note that
        // the new witnesses are used only in the recursive verification, so they don't create a soundness issue and can
        // be filled with anything as long as they contain a valid vk, proof and vk hash.

        for (auto [vk_witness, vk_element] : zip_view(vk_fields, honk_vk->to_field_elements())) {
            field_ct valid_vk_witness = field_ct::from_witness(&builder, vk_element);
            valid_vk_witness.unset_free_witness_tag();
            vk_witness = field_ct::conditional_assign(predicate, vk_witness, valid_vk_witness);
        }

        for (auto [proof_witness, proof_element] : zip_view(proof_fields, honk_proof)) {
            field_ct valid_proof_witness = field_ct::from_witness(&builder, proof_element);
            valid_proof_witness.unset_free_witness_tag();
            proof_witness = field_ct::conditional_assign(predicate, proof_witness, valid_proof_witness);
        }

        field_ct valid_vk_hash = field_ct(&builder, honk_vk->hash());
        valid_vk_hash.unset_free_witness_tag();
        vk_hash = field_ct::conditional_assign(predicate, vk_hash, valid_vk_hash);
    }

    // Recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(vk_fields);
    auto vk_and_hash = std::make_shared<RecursiveVKAndHash>(vkey, vk_hash);
    RecursiveVerifier verifier(&builder, vk_and_hash);
    UltraRecursiveVerifierOutput<Builder> verifier_output = verifier.template verify_proof<IO>(proof_fields);

#ifndef NDEBUG
    native_verification_debug<Flavor>(vkey, vk_hash.get_value(), proof_fields);
#endif

    return verifier_output;
}

#ifndef NDEBUG
/**
 * @brief Natively verify the stdlib proof for debugging
 */
template <typename Flavor>
void native_verification_debug(const std::shared_ptr<typename Flavor::VerificationKey> vkey,
                               const typename Flavor::NativeFlavor::FF vkey_hash,
                               const bb::stdlib::Proof<typename Flavor::CircuitBuilder>& proof_fields)
{
    using NativeVerificationKey = typename Flavor::NativeFlavor::VerificationKey;
    using NativeIO = std::conditional_t<HasIPAAccumulator<Flavor>, bb::RollupIO, bb::DefaultIO>;

    auto native_vkey = std::make_shared<NativeVerificationKey>(vkey->get_value());
    const bool vkey_and_hash_match = native_vkey->hash() == vkey_hash;
    HonkProof native_proof = proof_fields.get_value();

    HonkProof honk_proof;
    HonkProof ipa_proof;
    if constexpr (HasIPAAccumulator<Flavor>) {
        honk_proof = HonkProof(native_proof.begin(), native_proof.end() - IPA_PROOF_LENGTH);
        ipa_proof = HonkProof(native_proof.end() - IPA_PROOF_LENGTH, native_proof.end());
    } else {
        honk_proof = native_proof;
    }

    UltraVerifier_<typename Flavor::NativeFlavor> native_verifier(
        native_vkey, VerifierCommitmentKey<curve::Grumpkin>(1 << CONST_ECCVM_LOG_N));
    bool is_valid_proof(native_verifier.template verify_proof<NativeIO>(honk_proof, ipa_proof));

    info("===== HONK RECURSION CONSTRAINT DEBUG INFO =====");
    std::string flavor;
    if constexpr (HasIPAAccumulator<Flavor>) {
        flavor = "Ultra Rollup Flavor";
    } else if constexpr (Flavor::HasZK) {
        flavor = "Ultra ZK Flavor";
    } else {
        flavor = "Ultra Flavor";
    }
    info("Flavor used: ", flavor);
    info("Honk recursion constraint: native vk hash matches witness vk hash: ", vkey_and_hash_match ? "true" : "false");
    info("Honk recursion constraint: input proof verifies natively: ", is_valid_proof ? "true" : "false");
    info("===== END OF HONK RECURSION CONSTRAINT DEBUG INFO =====");
}
#endif

#define INSTANTIATE_HONK_RECURSION_CONSTRAINT(Flavor)                                                                  \
    template HonkRecursionConstraintOutput<typename Flavor::CircuitBuilder> create_honk_recursion_constraints<Flavor>( \
        typename Flavor::CircuitBuilder & builder, const RecursionConstraint& input);

INSTANTIATE_HONK_RECURSION_CONSTRAINT(UltraRecursiveFlavor_<UltraCircuitBuilder>)
INSTANTIATE_HONK_RECURSION_CONSTRAINT(UltraRollupRecursiveFlavor_<UltraCircuitBuilder>)
INSTANTIATE_HONK_RECURSION_CONSTRAINT(UltraRecursiveFlavor_<MegaCircuitBuilder>)
INSTANTIATE_HONK_RECURSION_CONSTRAINT(UltraZKRecursiveFlavor_<MegaCircuitBuilder>)
INSTANTIATE_HONK_RECURSION_CONSTRAINT(UltraZKRecursiveFlavor_<UltraCircuitBuilder>)

#undef INSTANTIATE_HONK_RECURSION_CONSTRAINT

#ifndef NDEBUG
#define INSTANTIATE_NATIVE_VERIFICATION_DEBUG(Flavor)                                                                  \
    template void native_verification_debug<Flavor>(const std::shared_ptr<typename Flavor::VerificationKey>,           \
                                                    const typename Flavor::NativeFlavor::FF vkey_hash,                 \
                                                    const bb::stdlib::Proof<typename Flavor::CircuitBuilder>&);

INSTANTIATE_NATIVE_VERIFICATION_DEBUG(UltraRecursiveFlavor_<UltraCircuitBuilder>)
INSTANTIATE_NATIVE_VERIFICATION_DEBUG(UltraRollupRecursiveFlavor_<UltraCircuitBuilder>)
INSTANTIATE_NATIVE_VERIFICATION_DEBUG(UltraRecursiveFlavor_<MegaCircuitBuilder>)
INSTANTIATE_NATIVE_VERIFICATION_DEBUG(UltraZKRecursiveFlavor_<MegaCircuitBuilder>)
INSTANTIATE_NATIVE_VERIFICATION_DEBUG(UltraZKRecursiveFlavor_<UltraCircuitBuilder>)

#undef INSTANTIATE_NATIVE_VERIFICATION_DEBUG

#endif

} // namespace acir_format
