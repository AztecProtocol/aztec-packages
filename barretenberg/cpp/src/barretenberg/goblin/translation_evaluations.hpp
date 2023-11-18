#pragma once
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <vector>

namespace barretenberg {
struct TranslationEvaluations {
    fq op, Px, Py, z1, z2;
    void print() const { info("op: ", op, "\n", "Px: ", Px, "\n", "Py: ", Py, "\n", "z1: ", z1, "\n", "z2: ", z2); };
};
} // namespace barretenberg