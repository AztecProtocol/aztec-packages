// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "pg_recursion_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "proof_surgeon.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

using namespace bb;

/**
 * @brief Create an IVC object with mocked state corresponding to a set of IVC recursion constraints
 * @details Construction of a kernel circuit requires two inputs: kernel prgram acir constraints and an IVC instance
 * containing state needed to complete the kernel logic, e.g. proofs for input to recursive verifiers. To construct
 * verification keys for kernel circuits without running a full IVC, we mock the IVC state corresponding to a provided
 * set of IVC recurson constraints. For example, if the constraints contain a single PG recursive verification, we
 * initialize an IVC with mocked data for the verifier accumulator, the folding proof, the circuit verification key,
 * and a merge proof.
 * @note There are only three valid combinations of IVC recursion constraints for a kernel program. See below for
 * details.
 *
 * @param constraints IVC recursion constraints from a kernel circuit
 * @param trace_settings
 * @return ClientIVC
 */
std::shared_ptr<ClientIVC> create_mock_ivc_from_constraints(const std::vector<RecursionConstraint>& constraints,
                                                            const TraceSettings& trace_settings)
{
    auto ivc = std::make_shared<ClientIVC>(constraints.size(), trace_settings);

    uint32_t oink_type = static_cast<uint32_t>(PROOF_TYPE::OINK);
    uint32_t pg_type = static_cast<uint32_t>(PROOF_TYPE::PG);
    uint32_t pg_final_type = static_cast<uint32_t>(PROOF_TYPE::PG_FINAL);
    uint32_t pg_tail_type = static_cast<uint32_t>(PROOF_TYPE::PG_TAIL);

    // There is a fixed set of valid combinations of IVC recursion constraints for Aztec kernel circuits:

    // Case: INIT kernel; single Oink recursive verification of an app
    if (constraints.size() == 1 && constraints[0].proof_type == oink_type) {
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::OINK, /*is_kernel=*/false);
        return ivc;
    }

    // Case: RESET kernel; single PG recursive verification of a kernel
    if (constraints.size() == 1 && constraints[0].proof_type == pg_type) {
        ivc->recursive_verifier_native_accum = create_mock_verifier_instance<ClientIVC::Flavor>();
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        return ivc;
    }

    // Case: TAIL kernel; single PG recursive verification of a kernel
    if (constraints.size() == 1 && constraints[0].proof_type == pg_tail_type) {
        ivc->recursive_verifier_native_accum = create_mock_verifier_instance<ClientIVC::Flavor>();
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG_TAIL, /*is_kernel=*/true);
        return ivc;
    }

    // Case: INNER kernel; two PG recursive verifications, kernel and app in that order
    if (constraints.size() == 2) {
        BB_ASSERT_EQ(constraints[0].proof_type, pg_type);
        BB_ASSERT_EQ(constraints[1].proof_type, pg_type);
        ivc->recursive_verifier_native_accum = create_mock_verifier_instance<ClientIVC::Flavor>();
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/false);
        return ivc;
    }

    // Case: HIDING kernel; single PG_FINAL recursive verification of a kernel
    if (constraints.size() == 1 && constraints[0].proof_type == pg_final_type) {
        ivc->recursive_verifier_native_accum = create_mock_verifier_instance<ClientIVC::Flavor>();
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG_FINAL, /*is_kernel=*/true);
        return ivc;
    }

    throw_or_abort("Invalid set of IVC recursion constraints!");
    return ivc;
}

/**
 * @brief Create a mock verification queue entry with proof and VK that have the correct structure but are not
 * necessarily valid
 *
 */
ClientIVC::VerifierInputs create_mock_verification_queue_entry(const ClientIVC::QUEUE_TYPE verification_type,
                                                               const TraceSettings& trace_settings,
                                                               const bool is_kernel)
{
    using FF = ClientIVC::FF;
    using MegaVerificationKey = ClientIVC::MegaVerificationKey;
    using Flavor = ClientIVC::Flavor;

    // Use the trace settings to determine the correct dyadic size and the public inputs offset
    MegaExecutionTraceBlocks blocks;
    blocks.set_fixed_block_sizes(trace_settings);
    blocks.compute_offsets(/*is_structured=*/true);
    size_t dyadic_size = blocks.get_structured_dyadic_size();
    size_t pub_inputs_offset = blocks.pub_inputs.trace_offset();

    // Construct a mock Oink or PG proof and a mock MegaHonk verification key
    std::vector<FF> proof;
    std::shared_ptr<MegaVerificationKey> verification_key;

    if (is_kernel) {
        using KernelIO = stdlib::recursion::honk::KernelIO;
        switch (verification_type) {
        case ClientIVC::QUEUE_TYPE::OINK:
            proof = create_mock_oink_proof<Flavor, KernelIO>();
            break;
        case ClientIVC::QUEUE_TYPE::PG:
        case ClientIVC::QUEUE_TYPE::PG_FINAL:
        case ClientIVC::QUEUE_TYPE::PG_TAIL:
            proof = create_mock_pg_proof<Flavor, KernelIO>();
            break;
        default:
            throw_or_abort("Invalid verification type! Only OINK, PG and PG_FINAL are supported");
        }
        verification_key = create_mock_honk_vk<Flavor, KernelIO>(dyadic_size, pub_inputs_offset);
    } else {
        using AppIO = stdlib::recursion::honk::AppIO;
        switch (verification_type) {
        case ClientIVC::QUEUE_TYPE::OINK:
            proof = create_mock_oink_proof<Flavor, AppIO>();
            break;
        case ClientIVC::QUEUE_TYPE::PG:
            proof = create_mock_pg_proof<Flavor, AppIO>();
            break;
        default:
            throw_or_abort("Invalid verification type! Only OINK, PG and PG_FINAL are supported");
        }
        verification_key = create_mock_honk_vk<Flavor, AppIO>(dyadic_size, pub_inputs_offset);
    }

    return ClientIVC::VerifierInputs{ proof, verification_key, verification_type, is_kernel };
}

/**
 * @brief Populate an IVC instance with data that mimics the state after a single IVC accumulation (Oink or PG)
 * @details Mock state consists of a mock verification queue entry of type OINK (proof, VK) and a mocked merge proof
 *
 * @param ivc
 * @param num_public_inputs_app num pub inputs in accumulated app, excluding fixed components, e.g. pairing points
 */
void mock_ivc_accumulation(const std::shared_ptr<ClientIVC>& ivc, ClientIVC::QUEUE_TYPE type, const bool is_kernel)
{
    ClientIVC::VerifierInputs entry =
        acir_format::create_mock_verification_queue_entry(type, ivc->trace_settings, is_kernel);
    ivc->verification_queue.emplace_back(entry);
    ivc->goblin.merge_verification_queue.emplace_back(acir_format::create_mock_merge_proof());
    // If the type is PG_FINAL, we also need to populate the ivc instance with a mock decider proof
    if (type == ClientIVC::QUEUE_TYPE::PG_FINAL) {
        ivc->decider_proof = acir_format::create_mock_decider_proof<ClientIVC::Flavor>();
    }
    ivc->num_circuits_accumulated++;
}

/**
 * @brief Populate VK witness fields from a recursion constraint from a provided VerificationKey
 *
 * @param builder
 * @param mock_verification_key
 * @param key_witness_indices
 */
void populate_dummy_vk_in_constraint(MegaCircuitBuilder& builder,
                                     const std::shared_ptr<MegaFlavor::VerificationKey>& mock_verification_key,
                                     std::vector<uint32_t>& key_witness_indices)
{
    using FF = ClientIVC::FF;

    // Convert the VerificationKey to fields
    std::vector<FF> mock_vk_fields = mock_verification_key->to_field_elements();
    BB_ASSERT_EQ(mock_vk_fields.size(), key_witness_indices.size());

    // Add the fields to the witness and set the key witness indices accordingly
    for (auto [witness_idx, value] : zip_view(key_witness_indices, mock_vk_fields)) {
        builder.set_variable(witness_idx, value);
    }
}

} // namespace acir_format
