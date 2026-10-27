#include "barretenberg/chonk/chonk_step_processor.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/memory_profile.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"

namespace bb {
namespace {

template <typename VK> void validate_vk_size(const std::vector<uint8_t>& vk_bytes)
{
    const size_t expected_size = VK::calc_num_data_types() * sizeof(bb::fr);
    if (vk_bytes.size() != expected_size) {
        throw_or_abort("verification key has wrong size: expected " + std::to_string(expected_size) + ", got " +
                       std::to_string(vk_bytes.size()));
    }
}

template <typename VK> std::shared_ptr<VK> deserialize_vk(const std::vector<uint8_t>& vk_bytes)
{
    validate_vk_size<VK>(vk_bytes);
    return from_buffer<std::shared_ptr<VK>>(vk_bytes);
}

template <CircuitKind K>
std::shared_ptr<typename flavor_for<K>::VerificationKey> compute_vk_from_program(acir_format::AcirProgram& program)
{
    using FlavorT = flavor_for<K>;
    auto builder = acir_format::create_circuit<circuit_for<K>>(program);
    return std::make_shared<typename FlavorT::VerificationKey>(ProverInstance_<FlavorT>(builder).get_precomputed());
}

} // namespace

ChonkStepProcessor::ChonkStepProcessor(std::vector<CircuitKind> circuit_kinds)
    : ivc(std::make_shared<Chonk>(std::move(circuit_kinds)))
{}

void ChonkStepProcessor::process_step(ChonkExecutionStep&& step, ChonkPrecomputedVkPolicy policy)
{
    // Throw (not BB_ASSERT) so it survives release/WASM: `kind` defaults to None (an unset step, or
    // one from an old/external msgpack) and never matches the expected kind, failing clearly here.
    if (step.kind != ivc->current_kind()) {
        throw_or_abort("ChonkStepProcessor: supplied CircuitKind disagrees with the kinds the IVC was started with");
    }

    // The kind fixes the arithmetization, so the circuit is created inside the dispatch: a step is translated
    // directly into the builder whose flavor will prove it.
    dispatch_kind(step.kind, [&]<CircuitKind K>() {
        using FlavorT = flavor_for<K>;
        using VK = typename FlavorT::VerificationKey;

        const acir_format::ProgramMetadata metadata{ .ivc = ivc };
        auto circuit = acir_format::create_circuit<circuit_for<K>>(step.program, metadata);
        // The circuit holds everything accumulation needs: free the constraint system and witness before
        // accumulating, which is when memory use peaks.
        step.program = acir_format::AcirProgram{};

        info("Chonk: accumulating ", step.name);
        if (detail::use_memory_profile) {
            detail::GLOBAL_MEMORY_PROFILE.set_circuit_name(step.name);
        }

        std::shared_ptr<VK> vk;
        if (policy == ChonkPrecomputedVkPolicy::RECOMPUTE) {
            vk = std::make_shared<VK>(ProverInstance_<FlavorT>(circuit).get_precomputed());
        } else {
            if (step.precomputed_vk.empty()) {
                throw_or_abort("Chonk: precomputed VK is required");
            }
            vk = deserialize_vk<VK>(step.precomputed_vk);
            if (policy == ChonkPrecomputedVkPolicy::CHECK) {
                auto computed_vk = std::make_shared<VK>(ProverInstance_<FlavorT>(circuit).get_precomputed());
                if (*vk != *computed_vk) {
                    throw_or_abort("Chonk: precomputed VK does not match computed VK");
                }
            }
        }
        ivc->accumulate(circuit, Chonk::CircuitVerificationKey{ vk });
    });
}

ChonkProof ChonkStepProcessor::prove()
{
    return ivc->prove();
}

std::shared_ptr<MegaZKFlavor::VKAndHash> ChonkStepProcessor::get_hiding_kernel_vk_and_hash() const
{
    return ivc->get_hiding_kernel_vk_and_hash();
}

ChonkVkData compute_chonk_vk(acir_format::AcirProgram& program, CircuitKind kind)
{
    return dispatch_kind(kind, [&]<CircuitKind K>() -> ChonkVkData {
        auto vk = compute_vk_from_program<K>(program);
        return { .bytes = to_buffer(*vk), .fields = vk->to_field_elements() };
    });
}

ChonkVkCheckResult check_precomputed_chonk_vk(acir_format::AcirProgram& program,
                                              const std::vector<uint8_t>& precomputed_vk,
                                              CircuitKind kind)
{
    return dispatch_kind(kind, [&]<CircuitKind K>() -> ChonkVkCheckResult {
        auto computed_vk = compute_vk_from_program<K>(program);
        auto expected_vk = deserialize_vk<typename flavor_for<K>::VerificationKey>(precomputed_vk);
        if (*computed_vk == *expected_vk) {
            return {};
        }
        return { .valid = false, .actual_vk = to_buffer(*computed_vk) };
    });
}

std::shared_ptr<Chonk::MegaZKVerificationKey> deserialize_chonk_vk(const std::vector<uint8_t>& vk)
{
    return deserialize_vk<Chonk::MegaZKVerificationKey>(vk);
}

std::shared_ptr<MegaZKFlavor::VKAndHash> deserialize_chonk_vk_and_hash(const std::vector<uint8_t>& vk)
{
    return std::make_shared<MegaZKFlavor::VKAndHash>(deserialize_chonk_vk(vk));
}

} // namespace bb
