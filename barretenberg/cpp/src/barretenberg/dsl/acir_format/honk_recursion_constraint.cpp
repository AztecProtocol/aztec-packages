// === AUDIT STATUS ===
// internal:    { status: completed, auditors: [Federico], commit: 8b4e1279ef130eeb18bce9ce2a9f0fa39a243697}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "honk_recursion_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "recursion_constraint.hpp"

#include <cstddef>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib::recursion::honk;

template <typename Flavor>
HonkRecursionConstraintOutput<typename Flavor::CircuitBuilder> create_honk_recursion_constraints(
    typename Flavor::CircuitBuilder& builder, const RecursionConstraint& input)
    requires(IsRecursiveFlavor<Flavor> && IsUltraHonk<typename Flavor::NativeFlavor>)
{
    using Builder = Flavor::CircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using bool_ct = bb::stdlib::bool_t<Builder>;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVKAndHash = Flavor::VKAndHash;
    using IO = std::conditional_t<HasIPAAccumulator<Flavor>,
                                  stdlib::recursion::honk::RollupIO,
                                  stdlib::recursion::honk::DefaultIO<Builder>>;
    using RecursiveVerifier = bb::UltraVerifier_<Flavor, IO>;
    using NativeFlavor = Flavor::NativeFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;

    BB_ASSERT(input.proof_type == HONK || input.proof_type == HONK_ZK || input.proof_type == ROLLUP_HONK ||
                  input.proof_type == ROOT_ROLLUP_HONK,
              "create_honk_recursion_constraints: Only HONK, HONK_ZK, ROLLUP_HONK, ROOT_ROLLUP_HONK proof types are "
              "supported.");
    BB_ASSERT_EQ(input.proof_type == ROLLUP_HONK || input.proof_type == ROOT_ROLLUP_HONK,
                 HasIPAAccumulator<Flavor>,
                 "create_honk_recursion_constraints: ROLLUP_HONK and ROOT_ROLLUP_HONK must be recursively verified "
                 "using a Flavor with IPA accumulator.");

    // Step 1.
    // Construct in-circuit representations of the recursion data
    std::vector<field_ct> vk_fields = fields_from_witnesses(builder, input.key);
    field_ct vk_hash = field_ct::from_witness_index(&builder, input.key_hash);
    std::vector<field_ct> proof_fields =
        fields_from_witnesses(builder, add_public_inputs_to_proof(input.proof, input.public_inputs));
    bool_ct predicate(to_field_ct(input.predicate, builder)); // Constructor enforces predicate = 0 or 1

    // Construct a Honk proof and vk with the correct number of public inputs.
    // If we are in a write vk scenario, the proof and vk are not necessarily valid
    const auto [honk_proof_to_be_set,
                honk_vk_to_be_set] = [&]() -> std::pair<HonkProof, std::shared_ptr<NativeVerificationKey>> {
        if (builder.is_write_vk_mode()) {
            return std::make_pair(
                create_mock_honk_proof<NativeFlavor, IO>(/*acir_public_inputs_size=*/input.public_inputs.size()),
                create_mock_honk_vk<NativeFlavor, IO>(
                    /*dyadic_size=*/1 << NativeFlavor::VIRTUAL_LOG_N,
                    /*pub_inputs_offset=*/NativeFlavor::has_zero_row ? 1 : 0,
                    /*acir_public_inputs_size=*/input.public_inputs.size()));
        }

        return construct_arbitrary_valid_honk_proof_and_vk<NativeFlavor>(
            /*acir_public_inputs_size=*/input.public_inputs.size());
    }();

    // Step 2.
    if (builder.is_write_vk_mode()) {
        // Set honk vk in builder
        populate_fields(builder, vk_fields, honk_vk_to_be_set->to_field_elements());

        // Set honk proof in builder
        populate_fields(builder, proof_fields, honk_proof_to_be_set);
    }

    // Step 3.
    if (!predicate.is_constant()) {
        // If the predicate is a witness, we conditionally assign a valid vk, proof and vk hash so that verification
        // succeeds. Note: in doing this, we create some new witnesses that are only used in the conditional assignment.
        // It would be optimal to hard-code these values in the selectors, but due to the randomness needed to generate
        // valid ZK proofs, we cannot do that without adding a dependency of the VKs on the witness values. Note that
        // the new witnesses are used only in the recursive verification when the predicate is set to true, so they
        // don't create a soundness issue and can be filled with anything - as long as they contain a valid vk, proof
        // and vk hash
        for (auto [vk_witness, vk_element] : zip_view(vk_fields, honk_vk_to_be_set->to_field_elements())) {
            field_ct valid_vk_witness = field_ct::from_witness(&builder, vk_element);
            valid_vk_witness.unset_free_witness_tag(); // Avoid tooling catching this as a free witness
            vk_witness = field_ct::conditional_assign(predicate, vk_witness, valid_vk_witness);
        }

        for (auto [proof_witness, proof_element] : zip_view(proof_fields, honk_proof_to_be_set)) {
            field_ct valid_proof_witness = field_ct::from_witness(&builder, proof_element);
            valid_proof_witness.unset_free_witness_tag(); // Avoid tooling catching this as a free witness
            proof_witness = field_ct::conditional_assign(predicate, proof_witness, valid_proof_witness);
        }

        field_ct valid_vk_hash = field_ct::from_witness(&builder, honk_vk_to_be_set->hash());
        valid_vk_hash.unset_free_witness_tag();
        vk_hash = field_ct::conditional_assign(predicate, vk_hash, valid_vk_hash);
    }

    // Recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(vk_fields);
    auto vk_and_hash = std::make_shared<RecursiveVKAndHash>(vkey, vk_hash);
    RecursiveVerifier verifier(vk_and_hash);
    UltraRecursiveVerifierOutput<Builder> verifier_output = verifier.verify_proof(proof_fields);

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
    auto native_vk_and_hash = std::make_shared<typename Flavor::NativeFlavor::VKAndHash>(native_vkey, vkey_hash);
    const bool vkey_and_hash_match = native_vkey->hash() == vkey_hash;
    HonkProof native_proof = proof_fields.get_value();

    UltraVerifier_<typename Flavor::NativeFlavor, NativeIO> native_verifier(native_vk_and_hash);
    bool is_valid_proof = native_verifier.verify_proof(native_proof).result;

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
