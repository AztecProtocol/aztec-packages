#include "api_avm.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <stdexcept>

namespace bb {

// AVM is NOT enabled in this build
const bool avm_enabled = false;

void avm_prove([[maybe_unused]] const std::filesystem::path& inputs_path,
               [[maybe_unused]] const std::filesystem::path& output_path)
{
    throw_or_abort("AVM is not supported in this build. Use the 'bb-avm' binary with full AVM support.");
}

void avm_check_circuit([[maybe_unused]] const std::filesystem::path& inputs_path)
{
    throw_or_abort("AVM is not supported in this build. Use the 'bb-avm' binary with full AVM support.");
}

bool avm_verify([[maybe_unused]] const std::filesystem::path& proof_path,
                [[maybe_unused]] const std::filesystem::path& public_inputs_path,
                [[maybe_unused]] const std::filesystem::path& vk_path)
{
    throw_or_abort("AVM is not supported in this build. Use the 'bb-avm' binary with full AVM support.");
}

void avm_simulate([[maybe_unused]] const std::filesystem::path& inputs_path)
{
    throw_or_abort("AVM is not supported in this build. Use the 'bb-avm' binary with full AVM support.");
}

} // namespace bb
