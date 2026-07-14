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

template <typename VK, typename Instance> std::shared_ptr<VK> compute_vk_from_program(acir_format::AcirProgram& program)
{
    auto builder = acir_format::create_circuit<Chonk::ClientCircuit>(program);
    return std::make_shared<VK>(Instance(builder).get_precomputed());
}

template <typename VK, typename Instance> ChonkVkData compute_vk_data(acir_format::AcirProgram& program)
{
    auto vk = compute_vk_from_program<VK, Instance>(program);
    return { .bytes = to_buffer(*vk), .fields = vk->to_field_elements() };
}

template <typename VK, typename Instance>
ChonkVkCheckResult check_vk(acir_format::AcirProgram& program, const std::vector<uint8_t>& precomputed_vk_bytes)
{
    auto computed_vk = compute_vk_from_program<VK, Instance>(program);
    auto precomputed_vk = deserialize_vk<VK>(precomputed_vk_bytes);
    if (*computed_vk == *precomputed_vk) {
        return {};
    }
    return { .valid = false, .actual_vk = to_buffer(*computed_vk) };
}

void accumulate_next_chonk_circuit(Chonk& ivc,
                                   Chonk::ClientCircuit& circuit,
                                   Chonk::CircuitKind kind,
                                   const std::vector<uint8_t>& precomputed_vk,
                                   ChonkPrecomputedVkPolicy policy)
{
    // Throw (not BB_ASSERT) so it survives release/WASM: `kind` defaults to None (an unset step, or
    // one from an old/external msgpack) and never matches the expected kind, failing clearly here.
    if (kind != ivc.current_kind()) {
        throw_or_abort("ChonkStepProcessor: supplied CircuitKind disagrees with the kinds the IVC was started with");
    }

    dispatch_kind(kind, [&]<Chonk::CircuitKind K>() {
        using FlavorT = flavor_for<K>;
        using VK = typename FlavorT::VerificationKey;
        std::shared_ptr<VK> vk;
        if (policy == ChonkPrecomputedVkPolicy::RECOMPUTE) {
            vk = std::make_shared<VK>(ProverInstance_<FlavorT>(circuit).get_precomputed());
        } else {
            if (precomputed_vk.empty()) {
                throw_or_abort("Chonk: precomputed VK is required");
            }
            vk = deserialize_vk<VK>(precomputed_vk);
            if (policy == ChonkPrecomputedVkPolicy::CHECK) {
                auto computed_vk = std::make_shared<VK>(ProverInstance_<FlavorT>(circuit).get_precomputed());
                if (*vk != *computed_vk) {
                    throw_or_abort("Chonk: precomputed VK does not match computed VK");
                }
            }
        }
        ivc.accumulate(circuit, Chonk::CircuitVerificationKey{ vk });
    });
}

} // namespace

ChonkStepProcessor::ChonkStepProcessor(std::vector<CircuitKind> circuit_kinds)
    : ivc(std::make_shared<Chonk>(std::move(circuit_kinds)))
{}

void ChonkStepProcessor::process_step(ChonkExecutionStep&& step, ChonkPrecomputedVkPolicy policy)
{
    const acir_format::ProgramMetadata metadata{ .ivc = ivc };
    auto circuit = acir_format::create_circuit<Chonk::ClientCircuit>(step.program, metadata);

    info("Chonk: accumulating ", step.name);
    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.set_circuit_name(step.name);
    }
    accumulate_next_chonk_circuit(*ivc, circuit, step.kind, step.precomputed_vk, policy);
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
    return dispatch_kind(kind, [&]<CircuitKind K>() {
        using FlavorT = flavor_for<K>;
        return compute_vk_data<typename FlavorT::VerificationKey, ProverInstance_<FlavorT>>(program);
    });
}

ChonkVkCheckResult check_precomputed_chonk_vk(acir_format::AcirProgram& program,
                                              const std::vector<uint8_t>& precomputed_vk,
                                              CircuitKind kind)
{
    return dispatch_kind(kind, [&]<CircuitKind K>() {
        using FlavorT = flavor_for<K>;
        return check_vk<typename FlavorT::VerificationKey, ProverInstance_<FlavorT>>(program, precomputed_vk);
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
