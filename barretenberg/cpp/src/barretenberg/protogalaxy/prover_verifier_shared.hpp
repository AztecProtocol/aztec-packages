#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <vector>

namespace bb {
std::vector<fr> update_gate_challenges(const fr perturbator_challenge,
                                       const std::vector<fr>& gate_challenges,
                                       const std::vector<fr>& round_challenges);

} // namespace bb