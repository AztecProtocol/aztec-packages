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

bool is_hiding_kernel(const Chonk& ivc)
{
    return ivc.num_circuits_accumulated + 1 == ivc.get_num_circuits();
}

void accumulate_next_chonk_circuit(Chonk& ivc,
                                   Chonk::ClientCircuit& circuit,
                                   const std::vector<uint8_t>& precomputed_vk,
                                   ChonkPrecomputedVkPolicy policy)
{
    if (is_hiding_kernel(ivc)) {
        std::shared_ptr<Chonk::MegaZKVerificationKey> vk;
        if (policy != ChonkPrecomputedVkPolicy::RECOMPUTE && !precomputed_vk.empty()) {
            vk = deserialize_vk<Chonk::MegaZKVerificationKey>(precomputed_vk);
            if (policy == ChonkPrecomputedVkPolicy::CHECK) {
                auto computed_vk = std::make_shared<Chonk::MegaZKVerificationKey>(
                    Chonk::HidingKernelProverInstance(circuit).get_precomputed());
                if (*vk != *computed_vk) {
                    throw_or_abort("Chonk: precomputed hiding-kernel VK does not match computed VK");
                }
            }
        }
        ivc.accumulate_hiding_kernel(circuit, vk);
        return;
    }

    std::shared_ptr<Chonk::MegaVerificationKey> vk;
    if (policy == ChonkPrecomputedVkPolicy::RECOMPUTE) {
        vk = std::make_shared<Chonk::MegaVerificationKey>(Chonk::ProverInstance(circuit).get_precomputed());
    } else {
        if (precomputed_vk.empty()) {
            throw_or_abort("Chonk: precomputed VK is required for non-hiding circuits");
        }
        vk = deserialize_vk<Chonk::MegaVerificationKey>(precomputed_vk);
        if (policy == ChonkPrecomputedVkPolicy::CHECK) {
            auto computed_vk =
                std::make_shared<Chonk::MegaVerificationKey>(Chonk::ProverInstance(circuit).get_precomputed());
            if (*vk != *computed_vk) {
                throw_or_abort("Chonk: precomputed VK does not match computed VK");
            }
        }
    }
    ivc.accumulate(circuit, vk);
}

} // namespace

ChonkStepProcessor::ChonkStepProcessor(size_t num_circuits)
    : ivc(std::make_shared<Chonk>(num_circuits))
{}

void ChonkStepProcessor::process_step(ChonkExecutionStep&& step, ChonkPrecomputedVkPolicy policy)
{
    const acir_format::ProgramMetadata metadata{ .ivc = ivc };
    auto circuit = acir_format::create_circuit<Chonk::ClientCircuit>(step.program, metadata);

    info("Chonk: accumulating ", step.name);
    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.set_circuit_name(step.name);
    }
    accumulate_next_chonk_circuit(*ivc, circuit, step.precomputed_vk, policy);
}

ChonkProof ChonkStepProcessor::prove()
{
    return ivc->prove();
}

std::shared_ptr<MegaZKFlavor::VKAndHash> ChonkStepProcessor::get_hiding_kernel_vk_and_hash() const
{
    return ivc->get_hiding_kernel_vk_and_hash();
}

ChonkVkData compute_chonk_vk(acir_format::AcirProgram& program, ChonkVkFlavor flavor)
{
    switch (flavor) {
    case ChonkVkFlavor::MEGA:
        return compute_vk_data<Chonk::MegaVerificationKey, Chonk::ProverInstance>(program);
    case ChonkVkFlavor::MEGA_ZK:
        return compute_vk_data<Chonk::MegaZKVerificationKey, Chonk::HidingKernelProverInstance>(program);
    }
    throw_or_abort("compute_chonk_vk: invalid VK flavor");
}

ChonkVkCheckResult check_precomputed_chonk_vk(acir_format::AcirProgram& program,
                                              const std::vector<uint8_t>& precomputed_vk,
                                              ChonkVkFlavor flavor)
{
    switch (flavor) {
    case ChonkVkFlavor::MEGA:
        return check_vk<Chonk::MegaVerificationKey, Chonk::ProverInstance>(program, precomputed_vk);
    case ChonkVkFlavor::MEGA_ZK:
        return check_vk<Chonk::MegaZKVerificationKey, Chonk::HidingKernelProverInstance>(program, precomputed_vk);
    }
    throw_or_abort("check_precomputed_chonk_vk: invalid VK flavor");
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
