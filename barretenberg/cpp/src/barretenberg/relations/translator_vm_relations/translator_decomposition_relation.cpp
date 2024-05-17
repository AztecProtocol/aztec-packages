#include "barretenberg/relations/translator_vm_relations/translator_decomposition_relation_impl.hpp"
#include "barretenberg/translator_vm/goblin_translator_flavor.hpp"
namespace bb {
template class GoblinTranslatorDecompositionRelationImpl<fr>;
DEFINE_SUMCHECK_RELATION_CLASS(GoblinTranslatorDecompositionRelationImpl, GoblinTranslatorFlavor);
} // namespace bb