#include "barretenberg/stdlib/honk_recursion/verifier/goblin_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {
// Implement stuff here
void GoblinRecursiveVerifier::verify(GoblinProof& proof)
{
    [[maybe_unused]] auto merge_pairing_points = merge_verifier.verify_proof(proof.merge_proof);

    // WORKTODO: need to either do the hacks to mimmick ECCVM or just incorporate genuine ECCVM
    // translator_verifier.verify_proof(proof.translator_proof);
}
} // namespace bb::stdlib::recursion::honk