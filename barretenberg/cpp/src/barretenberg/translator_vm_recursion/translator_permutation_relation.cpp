#include "barretenberg/relations/translator_vm_relations/translator_permutation_relation_impl.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/translator_vm_recursion/goblin_translator_recursive_flavor.hpp"

namespace bb {
template class GoblinTranslatorPermutationRelationImpl<stdlib::field_t<UltraCircuitBuilder>>;
template class GoblinTranslatorPermutationRelationImpl<stdlib::field_t<GoblinUltraCircuitBuilder>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(GoblinTranslatorPermutationRelationImpl,
                                        GoblinTranslatorRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(GoblinTranslatorPermutationRelationImpl,
                                        GoblinTranslatorRecursiveFlavor_<GoblinUltraCircuitBuilder>);
} // namespace bb