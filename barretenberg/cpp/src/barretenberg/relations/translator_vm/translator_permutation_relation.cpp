// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/relations/translator_vm/translator_permutation_relation_impl.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
namespace bb {
template class TranslatorPermutationRelationImpl<fr>;
DEFINE_SUMCHECK_RELATION_CLASS(TranslatorPermutationRelationImpl, TranslatorFlavor);
} // namespace bb