#include "barretenberg/relations/translator_vm/translator_decomposition_relation_impl.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/translator_vm_recursion/goblin_translator_recursive_flavor.hpp"

namespace bb {
template class GoblinTranslatorDecompositionRelationImpl<stdlib::field_t<UltraCircuitBuilder>>;
template class GoblinTranslatorDecompositionRelationImpl<stdlib::field_t<GoblinUltraCircuitBuilder>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(GoblinTranslatorDecompositionRelationImpl,
                                        GoblinTranslatorRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(GoblinTranslatorDecompositionRelationImpl,
                                        GoblinTranslatorRecursiveFlavor_<GoblinUltraCircuitBuilder>);

} // namespace bb
