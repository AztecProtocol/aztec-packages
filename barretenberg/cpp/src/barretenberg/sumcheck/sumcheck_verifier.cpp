// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/flavor/mega_avm_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "sumcheck.hpp"
#ifdef STARKNET_GARAGA_FLAVORS
#include "barretenberg/ext/starknet/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_zk_flavor.hpp"
#endif

namespace bb {

#define DEFINE_VERIFY_SUMCHECK(Flavor)                                                                                 \
    template <>                                                                                                        \
    SumcheckOutput<Flavor> verify_sumcheck<Flavor>(const std::shared_ptr<Flavor::Transcript>& transcript,              \
                                                   const Flavor::FF& alpha,                                            \
                                                   size_t virtual_log_n,                                               \
                                                   const RelationParameters<Flavor::FF>& relation_parameters,          \
                                                   const std::vector<Flavor::FF>& gate_challenges)                     \
    {                                                                                                                  \
        SumcheckVerifier<Flavor> sumcheck(transcript, alpha, virtual_log_n);                                           \
        return sumcheck.verify(relation_parameters, gate_challenges);                                                  \
    }

DEFINE_VERIFY_SUMCHECK(UltraFlavor);
DEFINE_VERIFY_SUMCHECK(UltraZKFlavor);
DEFINE_VERIFY_SUMCHECK(UltraKeccakFlavor);
DEFINE_VERIFY_SUMCHECK(UltraKeccakZKFlavor);
DEFINE_VERIFY_SUMCHECK(MegaFlavor);
DEFINE_VERIFY_SUMCHECK(MegaZKFlavor);

DEFINE_VERIFY_SUMCHECK(UltraRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_VERIFY_SUMCHECK(UltraRecursiveFlavor_<MegaCircuitBuilder>);
DEFINE_VERIFY_SUMCHECK(UltraZKRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_VERIFY_SUMCHECK(UltraZKRecursiveFlavor_<MegaCircuitBuilder>);
DEFINE_VERIFY_SUMCHECK(MegaRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_VERIFY_SUMCHECK(MegaRecursiveFlavor_<MegaCircuitBuilder>);
DEFINE_VERIFY_SUMCHECK(MegaZKRecursiveFlavor_<UltraCircuitBuilder>);
DEFINE_VERIFY_SUMCHECK(MegaZKRecursiveFlavor_<MegaCircuitBuilder>);
DEFINE_VERIFY_SUMCHECK(MegaAvmRecursiveFlavor_<UltraCircuitBuilder>);

#ifdef STARKNET_GARAGA_FLAVORS
DEFINE_VERIFY_SUMCHECK(UltraStarknetFlavor);
DEFINE_VERIFY_SUMCHECK(UltraStarknetZKFlavor);
#endif

#undef DEFINE_VERIFY_SUMCHECK

} // namespace bb
