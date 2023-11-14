#pragma once
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <vector>

namespace barretenberg {
struct GoblinTranslationConsistencyData {
    fq op, Px, Py, z1, z2;
    void print() const { info(op, "\n", Px, "\n", Py, "\n", z1, "\n", z2); };
};
} // namespace barretenberg