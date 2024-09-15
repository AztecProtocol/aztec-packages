#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"

namespace bb {
std::vector<fr> update_gate_challenges(const fr& perturbator_challenge,
                                       const std::vector<fr>& gate_challenges,
                                       const std::vector<fr>& init_challenges)
{
    const size_t num_challenges = gate_challenges.size();
    std::vector<fr> next_gate_challenges(num_challenges);

    for (size_t idx = 0; idx < num_challenges; idx++) {
        next_gate_challenges[idx] = gate_challenges[idx] + perturbator_challenge * init_challenges[idx];
    }
    return next_gate_challenges;
}

std::vector<fr> compute_round_challenge_pows(const size_t num_powers, const fr& round_challenge)
{
    std::vector<fr> pows(num_powers);
    pows[0] = round_challenge;
    for (size_t i = 1; i < num_powers; i++) {
        pows[i] = pows[i - 1].sqr();
    }
    return pows;
}

} // namespace bb