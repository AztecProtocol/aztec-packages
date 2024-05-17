#include "barretenberg/relations/translator_vm_relations/translator_extra_relations_impl.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/translator_vm_recursion/goblin_translator_recursive_flavor.hpp"

namespace bb {
template class GoblinTranslatorOpcodeConstraintRelationImpl<stdlib::field_t<UltraCircuitBuilder>>;
template class GoblinTranslatorAccumulatorTransferRelationImpl<stdlib::field_t<UltraCircuitBuilder>>;
template class GoblinTranslatorOpcodeConstraintRelationImpl<stdlib::field_t<GoblinUltraCircuitBuilder>>;
template class GoblinTranslatorAccumulatorTransferRelationImpl<stdlib::field_t<GoblinUltraCircuitBuilder>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(GoblinTranslatorOpcodeConstraintRelationImpl,
                                        GoblinTranslatorRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(GoblinTranslatorOpcodeConstraintRelationImpl,
                                        GoblinTranslatorRecursiveFlavor_<GoblinUltraCircuitBuilder>);
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(GoblinTranslatorAccumulatorTransferRelationImpl,
                                        GoblinTranslatorRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(GoblinTranslatorAccumulatorTransferRelationImpl,
                                        GoblinTranslatorRecursiveFlavor_<GoblinUltraCircuitBuilder>);

} // namespace bb