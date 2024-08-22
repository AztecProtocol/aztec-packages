#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"

namespace bb {
std::vector<fr> update_gate_challenges(const fr perturbator_challenge,
                                       const std::vector<fr>& gate_challenges,
                                       const std::vector<fr>& round_challenges)
{
    auto log_instance_size = gate_challenges.size();
    std::vector<fr> next_gate_challenges(log_instance_size);

    for (size_t idx = 0; idx < log_instance_size; idx++) {
        next_gate_challenges[idx] = gate_challenges[idx] + perturbator_challenge * round_challenges[idx];
    }
    return next_gate_challenges;
}
} // namespace bb