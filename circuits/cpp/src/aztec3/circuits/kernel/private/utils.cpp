#include "index.hpp"
#include "init.hpp"

#include <aztec3/circuits/mock/mock_kernel_circuit.hpp>
#include <aztec3/circuits/mock/native_mock_kernel_circuit.hpp>
#include <aztec3/utils/dummy_composer.hpp>

#include "barretenberg/proof_system/types/composer_type.hpp"

namespace {
using NT = aztec3::utils::types::NativeTypes;
using AggregationObject = aztec3::utils::types::NativeTypes::AggregationObject;
using aztec3::circuits::abis::PreviousKernelData;
using aztec3::circuits::mock::mock_kernel_circuit;
using aztec3::circuits::mock::native_mock_kernel_circuit;
using DummyComposer = aztec3::utils::DummyComposer;

}  // namespace

namespace aztec3::circuits::kernel::private_kernel::utils {

/**
 * @brief Create a fake verification key
 *
 * @details will not work with real circuits
 *
 * @return std::shared_ptr<NT::VK> fake verification key
 */
std::shared_ptr<NT::VK> fake_vk()
{
    std::map<std::string, NT::bn254_point> commitments;
    commitments["FAKE"] = *new NT::bn254_point(NT::fq(0), NT::fq(0));
    NT::VKData vk_data = { .composer_type = proof_system::ComposerType::TURBO,
                           .circuit_size = 2048,
                           .num_public_inputs = 116,
                           .commitments = commitments,
                           .contains_recursive_proof = false,
                           .recursive_proof_public_input_indices = {} };
    auto env_crs = std::make_unique<proof_system::EnvReferenceStringFactory>();
    return std::make_shared<NT::VK>(std::move(vk_data), env_crs->get_verifier_crs());
}

/**
 * @brief Create a dummy "previous kernel"
 *
 * @details For use in the first iteration of the  kernel circuit
 *
 * @param real_vk_proof should the vk and proof included be real and usable by real circuits?
 * @return PreviousKernelData<NT> the previous kernel data for use in the kernel circuit
 */
PreviousKernelData<NT> dummy_previous_kernel(bool real_vk_proof = false)
{
    PreviousKernelData<NT> const init_previous_kernel{};

    PreviousKernelData<NT> previous_kernel{};
    if (real_vk_proof) {
        auto crs_factory = std::make_shared<EnvReferenceStringFactory>();
        auto mock_kernel_composer = Composer(crs_factory);

        previous_kernel.public_inputs = mock_kernel_circuit(mock_kernel_composer, init_previous_kernel.public_inputs);

        auto mock_kernel_prover = mock_kernel_composer.create_prover();
        previous_kernel.proof = mock_kernel_prover.construct_proof();

        previous_kernel.vk = mock_kernel_composer.compute_verification_key();

        assert(!mock_kernel_composer.failed());
    } else {
        auto dummy_composer = DummyComposer();

        previous_kernel.public_inputs = native_mock_kernel_circuit(dummy_composer, init_previous_kernel.public_inputs);
        previous_kernel.proof = NT::Proof{ .proof_data = std::vector<uint8_t>(64, 0) };
        previous_kernel.vk = fake_vk();

        dummy_composer.log_failures_if_any("dummy_previous_kernel");
    }

    return previous_kernel;
}

}  // namespace aztec3::circuits::kernel::private_kernel::utils