#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <vector>

namespace proof_system::honk {

using proof = std::vector<bb::fr>;

} // namespace proof_system::honk