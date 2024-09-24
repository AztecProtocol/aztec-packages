#include "barretenberg/common/thread.hpp"
#include "gemini_impl.hpp"
namespace bb {
template class GeminiProver_<curve::BN254>;
template class GeminiProver_<curve::Grumpkin>;
}; // namespace bb