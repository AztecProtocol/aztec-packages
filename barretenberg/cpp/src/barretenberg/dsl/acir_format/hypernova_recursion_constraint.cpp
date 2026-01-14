// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#include "hypernova_recursion_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

using namespace bb;

/**
 * @brief Create a Chonk instance with mocked state corresponding to a set of IVC recursion constraints
 *
 * @details Aztec kernel circuits require a Chonk instance containing proofs and VKs for recursive
 * verification. During VK generation, we don't have real proofs, so we create mock data with the correct
 * structure. This function analyzes the recursion constraints to determine the appropriate mock state.
 *
 * Valid constraint combinations for Aztec kernels:
 * - INIT kernel: Single OINK constraint (verifies first app, no prior accumulator)
 * - INNER kernel: Two HN constraints (verifies previous kernel + new app)
 * - RESET kernel: Single HN constraint (verifies kernel only, resets accumulation)
 * - TAIL kernel: Single HN_TAIL constraint (final kernel before hiding kernel)
 * - HIDING kernel: Single HN_FINAL constraint (adds ZK hiding)
 *
 * @param constraints The IVC recursion constraints extracted from an Aztec kernel's ACIR
 * @return Chonk instance with mock verification queue entries matching the constraint pattern
 */
std::shared_ptr<Chonk> create_mock_chonk_from_constraints(const std::vector<RecursionConstraint>& constraints)
{
    auto ivc = std::make_shared<Chonk>(constraints.size());

    // Check constraint proof type. Throws if proof_type is not a valid HyperNova type
    auto constraint_has_type = [](const RecursionConstraint& c, Chonk::QUEUE_TYPE expected) {
        return proof_type_to_chonk_queue_type(c.proof_type) == expected;
    };

    // Match constraint patterns to kernel types and populate appropriate mock data:

    // INIT kernel: Verifies first app circuit (no prior accumulator exists)
    if (constraints.size() == 1 && constraint_has_type(constraints[0], Chonk::QUEUE_TYPE::OINK)) {
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::OINK, /*is_kernel=*/false);
        return ivc;
    }

    // RESET kernel: Verifies only a previous kernel (resets the IVC accumulation)
    if (constraints.size() == 1 && constraint_has_type(constraints[0], Chonk::QUEUE_TYPE::HN)) {
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN, /*is_kernel=*/true);
        return ivc;
    }

    // TAIL kernel: Final kernel in the chain before generating tube proof
    if (constraints.size() == 1 && constraint_has_type(constraints[0], Chonk::QUEUE_TYPE::HN_TAIL)) {
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN_TAIL, /*is_kernel=*/true);
        return ivc;
    }

    // INNER kernel: Verifies previous kernel + new app circuit
    if (constraints.size() == 2) {
        BB_ASSERT(constraint_has_type(constraints[0], Chonk::QUEUE_TYPE::HN),
                  "Inner kernel first constraint must be HN type");
        BB_ASSERT(constraint_has_type(constraints[1], Chonk::QUEUE_TYPE::HN),
                  "Inner kernel second constraint must be HN type");
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN, /*is_kernel=*/true);
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN, /*is_kernel=*/false);
        return ivc;
    }

    // HIDING kernel: Adds zero-knowledge hiding to the final proof
    if (constraints.size() == 1 && constraint_has_type(constraints[0], Chonk::QUEUE_TYPE::HN_FINAL)) {
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN_FINAL, /*is_kernel=*/true);
        return ivc;
    }

    throw_or_abort("Invalid set of IVC recursion constraints!");
    return ivc;
}

/**
 * @brief Create a mock verification queue entry with structurally correct proof and VK
 *
 * @details Constructs a VerifierInputs entry containing:
 * - A mock HyperNova proof with the correct field count for the proof type
 * - A mock MegaHonk verification key
 *
 * The proof structure depends on:
 * - Whether it's a kernel (always includes folding proof) or app circuit
 * - For apps: OINK proofs don't include folding data, HN proofs do
 *
 * @param verification_type The queue type (OINK, HN, HN_TAIL, HN_FINAL)
 * @param is_kernel True for kernel circuits, false for app circuits
 * @return VerifierInputs with mock proof, VK, and metadata
 */
Chonk::VerifierInputs create_mock_verification_queue_entry(const Chonk::QUEUE_TYPE verification_type,
                                                           const bool is_kernel)
{
    using IvcType = Chonk;
    using FF = IvcType::FF;
    using MegaVerificationKey = IvcType::MegaVerificationKey;
    using Flavor = IvcType::Flavor;

    // VK metadata: dyadic circuit size and public inputs offset
    size_t dyadic_size = 1 << Flavor::VIRTUAL_LOG_N;
    size_t pub_inputs_offset = Flavor::has_zero_row ? 1 : 0;

    std::vector<FF> proof;
    std::shared_ptr<MegaVerificationKey> verification_key;

    if (is_kernel) {
        using KernelIO = stdlib::recursion::honk::KernelIO;
        BB_ASSERT_EQ(verification_type == Chonk::QUEUE_TYPE::HN || verification_type == Chonk::QUEUE_TYPE::HN_TAIL ||
                         verification_type == Chonk::QUEUE_TYPE::HN_FINAL,
                     true);

        // Kernel circuits always have a prior accumulator, so fold proof is always included
        constexpr bool include_fold = true;
        proof = create_mock_hyper_nova_proof<Flavor, KernelIO>(include_fold);
        verification_key = create_mock_honk_vk<Flavor, KernelIO>(dyadic_size, pub_inputs_offset);
    } else {
        using AppIO = stdlib::recursion::honk::AppIO;
        BB_ASSERT_EQ(verification_type == Chonk::QUEUE_TYPE::OINK || verification_type == Chonk::QUEUE_TYPE::HN, true);

        // First app (OINK) has no prior accumulator; subsequent apps (HN) do
        bool include_fold = (verification_type != Chonk::QUEUE_TYPE::OINK);
        proof = create_mock_hyper_nova_proof<Flavor, AppIO>(include_fold);
        verification_key = create_mock_honk_vk<Flavor, AppIO>(dyadic_size, pub_inputs_offset);
    }

    return Chonk::VerifierInputs{ proof, verification_key, verification_type, is_kernel };
}

/**
 * @brief Add mock accumulation state to a Chonk instance for a single circuit
 *
 * @details Populates the IVC with mock data representing one circuit accumulation:
 * 1. Initializes the recursive verifier accumulator (challenge vector, evaluations, commitments)
 *    - This is hashed in-circuit to bind the accumulator state
 * 2. Adds a mock verification queue entry (proof + VK) for the accumulated circuit
 * 3. Adds a mock merge proof
 * 4. For HN_FINAL: also adds a mock decider/PCS proof
 *
 * @param ivc The Chonk instance to populate
 * @param type Verification queue type determining proof structure
 * @param is_kernel True for kernel circuits (different public inputs layout)
 */
void mock_chonk_accumulation(const std::shared_ptr<Chonk>& ivc, Chonk::QUEUE_TYPE type, const bool is_kernel)
{
    using FF = Chonk::FF;
    using Commitment = Chonk::Commitment;

    // Initialize verifier accumulator with proper structure
    ivc->recursive_verifier_native_accum.challenge = std::vector<FF>(Chonk::Flavor::VIRTUAL_LOG_N, FF::zero());
    ivc->recursive_verifier_native_accum.non_shifted_evaluation = FF::zero();
    ivc->recursive_verifier_native_accum.shifted_evaluation = FF::zero();
    ivc->recursive_verifier_native_accum.non_shifted_commitment = Commitment::one();
    ivc->recursive_verifier_native_accum.shifted_commitment = Commitment::one();

    Chonk::VerifierInputs entry = acir_format::create_mock_verification_queue_entry(type, is_kernel);
    ivc->verification_queue.emplace_back(entry);
    ivc->goblin.merge_verification_queue.emplace_back(acir_format::create_mock_merge_proof());
    if (type == Chonk::QUEUE_TYPE::HN_FINAL) {
        ivc->decider_proof = acir_format::create_mock_pcs_proof<Chonk::Flavor>();
    }
    ivc->num_circuits_accumulated++;
}

} // namespace acir_format
