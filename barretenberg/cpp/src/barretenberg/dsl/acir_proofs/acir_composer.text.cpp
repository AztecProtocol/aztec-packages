#include <gtest/gtest.h>
#include "acir_composer.hpp"

namespace acir_proofs {

TEST(AcirComposerTest, ProofSizeConstant) {
    std::vector<uint8_t> dummy_proof(PROOF_SIZE_WITHOUT_PUBLIC_INPUTS + 32 * 10); // 10 public inputs

    AcirComposer acir_composer(0, false);

    EXPECT_NO_THROW({
        acir_composer.verify_proof(dummy_proof);
    });
}
}