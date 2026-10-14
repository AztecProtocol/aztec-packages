#include "barretenberg/relations/translator_vm/translator_shiftable_first_coeff_zero_relation_impl.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
namespace bb {
template class TranslatorShiftableFirstCoeffZeroRelationImpl<fr>;
DEFINE_SUMCHECK_RELATION_CLASS(TranslatorShiftableFirstCoeffZeroRelationImpl, TranslatorFlavor);
} // namespace bb
