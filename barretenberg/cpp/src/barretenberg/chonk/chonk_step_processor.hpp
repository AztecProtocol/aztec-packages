#pragma once

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace bb {

enum class ChonkPrecomputedVkPolicy : uint8_t { DEFAULT, CHECK, RECOMPUTE };

struct ChonkVkData {
    std::vector<uint8_t> bytes;
    std::vector<bb::fr> fields;
};

struct ChonkVkCheckResult {
    bool valid = true;
    std::vector<uint8_t> actual_vk;
};

struct ChonkExecutionStep {
    std::string name;
    acir_format::AcirProgram program;
    std::vector<uint8_t> precomputed_vk;
    CircuitKind kind = CircuitKind::App;
};

class ChonkStepProcessor {
  public:
    explicit ChonkStepProcessor(std::vector<CircuitKind> circuit_kinds);

    std::shared_ptr<Chonk> get_ivc() const { return ivc; }
    size_t get_num_circuits_accumulated() const { return ivc->get_num_circuits_accumulated(); }

    void process_step(ChonkExecutionStep&& step, ChonkPrecomputedVkPolicy policy = ChonkPrecomputedVkPolicy::DEFAULT);

    ChonkProof prove();
    std::shared_ptr<MegaZKFlavor::VKAndHash> get_hiding_kernel_vk_and_hash() const;

  private:
    std::shared_ptr<Chonk> ivc;
};

ChonkVkData compute_chonk_vk(acir_format::AcirProgram& program, CircuitKind kind);

ChonkVkCheckResult check_precomputed_chonk_vk(acir_format::AcirProgram& program,
                                              const std::vector<uint8_t>& precomputed_vk,
                                              CircuitKind kind);

std::shared_ptr<Chonk::MegaZKVerificationKey> deserialize_chonk_vk(const std::vector<uint8_t>& vk);

std::shared_ptr<MegaZKFlavor::VKAndHash> deserialize_chonk_vk_and_hash(const std::vector<uint8_t>& vk);

} // namespace bb
