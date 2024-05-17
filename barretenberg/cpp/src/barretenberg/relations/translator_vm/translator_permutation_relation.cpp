#include "barretenberg/relations/translator_vm/translator_permutation_relation_impl.hpp"
#include "barretenberg/translator_vm/goblin_translator_flavor.hpp"
namespace bb {
template class GoblinTranslatorPermutationRelationImpl<fr>;
DEFINE_SUMCHECK_RELATION_CLASS(GoblinTranslatorPermutationRelationImpl, GoblinTranslatorFlavor);
} // namespace bb