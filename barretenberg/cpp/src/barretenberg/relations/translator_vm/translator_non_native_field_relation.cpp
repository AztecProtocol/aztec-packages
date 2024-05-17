#include "barretenberg/relations/translator_vm/translator_non_native_field_relation_impl.hpp"
#include "barretenberg/translator_vm/goblin_translator_flavor.hpp"
namespace bb {
template class GoblinTranslatorNonNativeFieldRelationImpl<fr>;
DEFINE_SUMCHECK_RELATION_CLASS(GoblinTranslatorNonNativeFieldRelationImpl, GoblinTranslatorFlavor);
} // namespace bb