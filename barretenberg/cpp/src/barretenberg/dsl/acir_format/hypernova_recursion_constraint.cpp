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
 * - RESET/TAIL kernel: Single HN constraint (verifies the previous kernel only)
 * - HIDING kernel: Single HN_FINAL constraint (adds ZK hiding and verifies one batch merge proof)
 *
 * @param constraints The IVC recursion constraints extracted from an Aztec kernel's ACIR
 * @return Chonk instance with mock verification queue entries matching the constraint pattern
 */
std::shared_ptr<Chonk> create_mock_chonk_from_constraints(const std::vector<RecursionConstraint>& constraints)
{
    // Check constraint proof type against the ACIR PROOF_TYPE values emitted by Noir.
    auto has_proof_type = [](const RecursionConstraint& c, PROOF_TYPE expected) {
        return c.proof_type == static_cast<uint32_t>(expected);
    };

    BB_ASSERT(!constraints.empty(), "At least one recursion constraint is required to determine Chonk state");
    const bool is_init = has_proof_type(constraints[0], PROOF_TYPE::OINK);
    // Reset and tail kernels are structurally identical from the IVC's perspective: each verifies a
    // single previous kernel proof (HN). They are not distinguished here.
    const bool is_reset_or_tail = (constraints.size() == 1 && has_proof_type(constraints[0], PROOF_TYPE::HN));
    const bool is_hiding = (constraints.size() == 1 && has_proof_type(constraints[0], PROOF_TYPE::HN_FINAL));
    const size_t upper_bound = is_init ? MAX_APPS_PER_KERNEL : MAX_APPS_PER_KERNEL + 1;
    BB_ASSERT_LTE(constraints.size(), upper_bound, "Too many recursion constraints encountered when mocking IVC state");

    // Build a constructor-valid circuit_kinds stack that faithfully places the kernel being mocked at
    // `target_idx`, preceded by the circuits whose proofs it verifies (its group). The IVC is then positioned
    // at `target_idx` so that complete_kernel_circuit_logic derives is_init_kernel()/is_hiding_kernel() from a
    // state reachable by a real run. For non-hiding kernels the trailing kernels (tail and hiding) are appended to
    // satisfy the constructor; it does not affect the mocked kernel's VK.
    //
    // `group` lists, for each proof the target kernel verifies, whether it is a kernel proof and whether this is
    // the hiding kernel's group (which additionally needs mock decider and batch-merge proofs).
    std::vector<CircuitKind> kinds;
    struct GroupEntry {
        bool is_kernel;
        bool is_hiding;
    };
    std::vector<GroupEntry> group;
    size_t target_idx = 0;

    if (is_init) {
        // INIT kernel: verifies the leading apps (the first via an OINK proof, the rest via HN). No prior
        // accumulator exists.
        group.push_back({ /*is_kernel=*/false, /*is_hiding=*/false });
        for (size_t idx = 1; idx < constraints.size(); idx++) {
            BB_ASSERT(has_proof_type(constraints[idx], PROOF_TYPE::HN),
                      "Subsequent constraints in init kernel must be HN");
            group.push_back({ /*is_kernel=*/false, /*is_hiding=*/false });
        }
        kinds.assign(group.size(), CircuitKind::App); // leading apps == the group
        target_idx = kinds.size();
        kinds.push_back(CircuitKind::Kernel);       // init kernel (target)
        kinds.push_back(CircuitKind::Kernel);       // tail kernel
        kinds.push_back(CircuitKind::HidingKernel); // hiding kernel
    } else if (is_hiding) {
        // HIDING kernel: the final circuit; verifies the tail kernel's proof and adds ZK hiding.
        group.push_back({ /*is_kernel=*/true, /*is_hiding=*/true });
        kinds = { CircuitKind::App, CircuitKind::Kernel, CircuitKind::Kernel, CircuitKind::HidingKernel };
        target_idx = kinds.size() - 1; // the hiding kernel; its group is the tail kernel at index 2
    } else {
        // INNER kernel: verifies the previous kernel followed by its apps. RESET/TAIL is the degenerate case
        // with no apps (a single previous-kernel proof).
        BB_ASSERT(has_proof_type(constraints[0], PROOF_TYPE::HN),
                  "First constraint in inner/reset kernel must verify the previous kernel (HN)");
        group.push_back({ /*is_kernel=*/true, /*is_hiding=*/false }); // previous kernel
        for (size_t idx = 1; idx < constraints.size(); idx++) {
            BB_ASSERT(has_proof_type(constraints[idx], PROOF_TYPE::HN),
                      "Subsequent constraints in inner kernel must be HN");
            group.push_back({ /*is_kernel=*/false, /*is_hiding=*/false }); // app
        }
        BB_ASSERT(is_reset_or_tail || group.size() > 1,
                  "Single-proof non-init kernel must be a reset/tail (HN) kernel");
        const size_t num_apps = group.size() - 1;
        kinds.push_back(CircuitKind::App);                     // first app of the stack
        kinds.push_back(CircuitKind::Kernel);                  // previous kernel (the group's first proof)
        kinds.insert(kinds.end(), num_apps, CircuitKind::App); // the group's apps
        target_idx = kinds.size();
        kinds.push_back(CircuitKind::Kernel);       // target kernel
        kinds.push_back(CircuitKind::Kernel);       // tail kernel
        kinds.push_back(CircuitKind::HidingKernel); // hiding kernel
    }

    auto ivc = std::make_shared<Chonk>(kinds);
    for (const auto& entry : group) {
        mock_chonk_accumulation(ivc, entry.is_kernel, entry.is_hiding);
    }
    // Position the IVC at the kernel being mocked so current_kind() reports its kind.
    ivc->set_num_circuits_accumulated_for_mocking(target_idx);
    return ivc;
}

/**
 * @brief Create a mock verification queue entry with structurally correct proof and VK
 *
 * @details Constructs a VerifierInputs entry containing a mock sumcheck-to-accumulator proof and a mock MegaHonk
 * verification key. The proof structure depends only on whether the queued circuit is a kernel or an app (all
 * app proofs are structurally identical, as are all kernel proofs).
 *
 * @param is_kernel True for kernel circuits, false for app circuits
 * @return VerifierInputs with mock proof, VK, and metadata
 */
Chonk::VerifierInputs create_mock_verification_queue_entry(const bool is_kernel)
{
    using IvcType = Chonk;
    using AppFlavor = IvcType::AppFlavor;
    using KernelFlavor = IvcType::KernelFlavor;

    Chonk::VerifierInputs entry;
    entry.kind = is_kernel ? Chonk::CircuitKind::Kernel : Chonk::CircuitKind::App;

    if (is_kernel) {
        using KernelIO = stdlib::recursion::honk::KernelIO;
        entry.proof = create_mock_sumcheck_to_accumulator_proof<KernelFlavor, KernelIO>();
        entry.kernel_honk_vk = create_mock_honk_vk<KernelFlavor, KernelIO>(1 << KernelFlavor::VIRTUAL_LOG_N);
    } else {
        using AppIO = stdlib::recursion::honk::AppIO;
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
 * 3. For the hiding kernel's group: adds one mock batch merge proof and a mock decider/PCS proof
 *
 * @param ivc The Chonk instance to populate
 * @param is_kernel True for kernel circuits (different public inputs layout)
 * @param is_hiding_kernel True when mocking the hiding kernel's group (verifying the tail kernel's proof)
 */
void mock_chonk_accumulation(const std::shared_ptr<Chonk>& ivc, const bool is_kernel, const bool is_hiding_kernel)
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

    Chonk::VerifierInputs entry = acir_format::create_mock_verification_queue_entry(is_kernel);
    ivc->verification_queue.emplace_back(entry);

    // The kernel batches the accumulator carried in from the previous kernel (absent for the init kernel, whose queue
    // begins with an app) plus one claim per queued proof. Each call refreshes the mock batching proof so the last
    // one (with the full group) carries the correct width; a single-claim init kernel needs no batching proof.
    const bool is_init =
        !ivc->verification_queue.empty() && ivc->verification_queue.front().kind == Chonk::CircuitKind::App;
    const size_t num_claims = (is_init ? 0 : 1) + ivc->verification_queue.size();
    if (num_claims >= 2) {
        ivc->multilinear_batch_proof = acir_format::create_mock_multilinear_batch_proof(num_claims);
    }
    if (is_hiding_kernel) {
        ivc->goblin.batch_merge_proof = acir_format::create_mock_batch_merge_proof();
        // The PCS proof only depends on the VIRTUAL_LOG_N specified by the Flavor. KernelFlavor and
        // AppFlavor have the same VIRTUAL_LOG_N, so we can generate the mock PCS proof with either.
        ivc->decider_proof = acir_format::create_mock_pcs_proof<Chonk::KernelFlavor>();
    }
    ivc->set_num_circuits_accumulated_for_mocking(ivc->get_num_circuits_accumulated() + 1);
}

} // namespace acir_format
