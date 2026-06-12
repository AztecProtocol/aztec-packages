// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#include "hypernova_recursion_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"

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
 * - HIDING kernel: Single HN_FINAL constraint (adds ZK hiding and verifies one batch merge proof)
 *
 * @param constraints The IVC recursion constraints extracted from an Aztec kernel's ACIR
 * @return Chonk instance with mock verification queue entries matching the constraint pattern
 */
std::shared_ptr<Chonk> create_mock_chonk_from_constraints(const std::vector<RecursionConstraint>& constraints)
{
    // Create mock circuit kinds and IVC
    // The circuit kind is only used by the prover, so they do not have to reflect the series of circuits that are
    // mocked, they only need to satisfy the requirements of the constructor
    std::vector<CircuitKind> mock_kinds(static_cast<size_t>(MAX_APPS_PER_KERNEL + 1) + bb::NUM_TRAILING_KERNELS,
                                        CircuitKind::Kernel);
    mock_kinds.front() = CircuitKind::App;
    mock_kinds.back() = CircuitKind::HidingKernel;
    auto ivc = std::make_shared<Chonk>(mock_kinds);

    // Check constraint proof type. Throws if proof_type is not a valid HyperNova type
    auto constraint_has_type = [](const RecursionConstraint& c, Chonk::QUEUE_TYPE expected) {
        return proof_type_to_chonk_queue_type(c.proof_type) == expected;
    };

    BB_ASSERT(!constraints.empty(), "At least one recursion constraint is required to determine Chonk state");
    const bool is_init = constraint_has_type(constraints[0], Chonk::QUEUE_TYPE::OINK);
    const bool is_reset = (constraints.size() == 1 && constraint_has_type(constraints[0], Chonk::QUEUE_TYPE::HN));
    const bool is_tail = (constraints.size() == 1 && constraint_has_type(constraints[0], Chonk::QUEUE_TYPE::HN_TAIL));
    const bool is_hiding =
        (constraints.size() == 1 && constraint_has_type(constraints[0], Chonk::QUEUE_TYPE::HN_FINAL));
    const size_t upper_bound = is_init ? MAX_APPS_PER_KERNEL : MAX_APPS_PER_KERNEL + 1;
    BB_ASSERT_LTE(constraints.size(), upper_bound, "Too many recursion constraints encountered when mocking IVC state");

    // Match constraint patterns to kernel types and populate appropriate mock data:

    // INIT kernel: Verifies first app circuit (no prior accumulator exists)
    if (is_init) {
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::OINK, /*is_kernel=*/false);
        for (size_t idx = 1; idx < constraints.size(); idx++) {
            BB_ASSERT(constraint_has_type(constraints[idx], Chonk::QUEUE_TYPE::HN),
                      "Subsequent constraints in init kernel must be HN type");
            mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN, /*is_kernel=*/false);
        }
        return ivc;
    }

    // RESET kernel: Verifies only a previous kernel (resets the IVC accumulation)
    if (is_reset) {
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN, /*is_kernel=*/true);
        return ivc;
    }

    // TAIL kernel: Final kernel in the chain before hiding kernel
    if (is_tail) {
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN_TAIL, /*is_kernel=*/true);
        return ivc;
    }

    // HIDING kernel: Adds zero-knowledge hiding to the final proof
    if (is_hiding) {
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN_FINAL, /*is_kernel=*/true);
        return ivc;
    }

    // INNER kernel: Verifies previous kernel + app circuits
    bool is_kernel = true;
    for (const auto& constraint : constraints) {
        BB_ASSERT(constraint_has_type(constraint, Chonk::QUEUE_TYPE::HN),
                  "All constraints in inner kernel must be HN type");
        mock_chonk_accumulation(ivc, Chonk::QUEUE_TYPE::HN, /*is_kernel=*/is_kernel);
        is_kernel = false; // First constraint verifies previous kernel, subsequent constraints verify apps
    }
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
    using AppFlavor = IvcType::AppFlavor;
    using KernelFlavor = IvcType::KernelFlavor;

    Chonk::VerifierInputs entry;
    entry.type = verification_type;
    entry.kind = is_kernel ? Chonk::CircuitKind::Kernel : Chonk::CircuitKind::App;

    if (is_kernel) {
        using KernelIO = stdlib::recursion::honk::KernelIO;
        BB_ASSERT_EQ(verification_type == Chonk::QUEUE_TYPE::HN || verification_type == Chonk::QUEUE_TYPE::HN_TAIL ||
                         verification_type == Chonk::QUEUE_TYPE::HN_FINAL,
                     true);

        entry.proof = create_mock_sumcheck_to_accumulator_proof<KernelFlavor, KernelIO>();
        entry.kernel_honk_vk = create_mock_honk_vk<KernelFlavor, KernelIO>(1 << KernelFlavor::VIRTUAL_LOG_N);
    } else {
        using AppIO = stdlib::recursion::honk::AppIO;
        BB_ASSERT_EQ(verification_type == Chonk::QUEUE_TYPE::OINK || verification_type == Chonk::QUEUE_TYPE::HN, true);

        entry.proof = create_mock_sumcheck_to_accumulator_proof<AppFlavor, AppIO>();
        entry.app_honk_vk = create_mock_honk_vk<AppFlavor, AppIO>(1 << AppFlavor::VIRTUAL_LOG_N);
    }

    return entry;
}

/**
 * @brief Add mock accumulation state to a Chonk instance for a single circuit
 *
 * @details Populates the IVC with mock data representing one circuit accumulation:
 * 1. Initializes the recursive verifier accumulator (challenge vector, evaluations, commitments)
 *    - This is hashed in-circuit to bind the accumulator state
 * 2. Adds a mock verification queue entry (proof + VK) for the accumulated circuit
 * 3. For HN_FINAL: adds one mock batch merge proof and a mock decider/PCS proof
 *
 * @param ivc The Chonk instance to populate
 * @param type Verification queue type determining proof structure
 * @param is_kernel True for kernel circuits (different public inputs layout)
 */
void mock_chonk_accumulation(const std::shared_ptr<Chonk>& ivc, Chonk::QUEUE_TYPE type, const bool is_kernel)
{
    using FF = Chonk::FF;
    using Commitment = Chonk::Commitment;

    // The size of the challenge only depends on the VIRTUAL_LOG_N specified by the Flavor.
    // KernelFlavor and AppFlavor have the same VIRTUAL_LOG_N, so we can generate the challenge
    // vector with either.
    ivc->recursive_verifier_native_accum.challenge = std::vector<FF>(Chonk::KernelFlavor::VIRTUAL_LOG_N, FF::zero());
    ivc->recursive_verifier_native_accum.non_shifted_evaluation = FF::zero();
    ivc->recursive_verifier_native_accum.shifted_evaluation = FF::zero();
    ivc->recursive_verifier_native_accum.non_shifted_commitment = Commitment::one();
    ivc->recursive_verifier_native_accum.shifted_commitment = Commitment::one();

    Chonk::VerifierInputs entry = acir_format::create_mock_verification_queue_entry(type, is_kernel);
    ivc->verification_queue.emplace_back(entry);

    // The kernel batches the accumulator carried in from the previous kernel (absent for the init kernel, whose queue
    // begins with an OINK app) plus one claim per queued proof. Each call refreshes the mock batching proof so the last
    // one (with the full group) carries the correct width; a single-claim init kernel needs no batching proof.
    const bool is_init =
        !ivc->verification_queue.empty() && ivc->verification_queue.front().type == Chonk::QUEUE_TYPE::OINK;
    const size_t num_claims = (is_init ? 0 : 1) + ivc->verification_queue.size();
    if (num_claims >= 2) {
        ivc->multilinear_batch_proof = acir_format::create_mock_multilinear_batch_proof(num_claims);
    }
    if (type == Chonk::QUEUE_TYPE::HN_FINAL) {
        ivc->goblin.batch_merge_proof = acir_format::create_mock_batch_merge_proof();
        // The PCS proof only depends on the VIRTUAL_LOG_N specified by the Flavor. KernelFlavor and
        // AppFlavor have the same VIRTUAL_LOG_N, so we can generate the mock PCS proof with either.
        ivc->decider_proof = acir_format::create_mock_pcs_proof<Chonk::KernelFlavor>();
    }
    ivc->num_circuits_accumulated++;
}

} // namespace acir_format
