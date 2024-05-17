#include "barretenberg/relations/translator_vm_relations/translator_delta_range_constraint_relation_impl.hpp"
#include "barretenberg/translator_vm/goblin_translator_flavor.hpp"
namespace bb {
template class GoblinTranslatorDeltaRangeConstraintRelationImpl<fr>;
DEFINE_SUMCHECK_RELATION_CLASS(GoblinTranslatorDeltaRangeConstraintRelationImpl, GoblinTranslatorFlavor);
} // namespace bb