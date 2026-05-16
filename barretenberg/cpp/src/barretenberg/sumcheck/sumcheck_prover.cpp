// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "sumcheck.hpp"
#ifdef STARKNET_GARAGA_FLAVORS
#include "barretenberg/ext/starknet/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_zk_flavor.hpp"
#endif

namespace bb {

#define DEFINE_PROVE_SUMCHECK(Flavor)                                                                                  \
    template <>                                                                                                        \
    SumcheckOutput<Flavor> prove_sumcheck<Flavor>(size_t multivariate_n,                                               \
                                                  Flavor::ProverPolynomials& prover_polynomials,                       \
                                                  const std::shared_ptr<Flavor::Transcript>& transcript,               \
                                                  const Flavor::FF& alpha,                                             \
                                                  const std::vector<Flavor::FF>& gate_challenges,                      \
                                                  const RelationParameters<Flavor::FF>& relation_parameters,           \
                                                  size_t virtual_log_n)                                                \
    {                                                                                                                  \
        SumcheckProver<Flavor> sumcheck(multivariate_n,                                                                \
                                        prover_polynomials,                                                            \
                                        transcript,                                                                    \
                                        alpha,                                                                         \
                                        gate_challenges,                                                               \
                                        relation_parameters,                                                           \
                                        virtual_log_n);                                                                \
        return sumcheck.prove();                                                                                       \
    }

#define DEFINE_PROVE_ZK_SUMCHECK(Flavor)                                                                               \
    template <>                                                                                                        \
    SumcheckOutput<Flavor> prove_zk_sumcheck<Flavor>(size_t multivariate_n,                                            \
                                                     Flavor::ProverPolynomials& prover_polynomials,                    \
                                                     const std::shared_ptr<Flavor::Transcript>& transcript,            \
                                                     const Flavor::FF& alpha,                                          \
                                                     const std::vector<Flavor::FF>& gate_challenges,                   \
                                                     const RelationParameters<Flavor::FF>& relation_parameters,        \
                                                     size_t virtual_log_n,                                             \
                                                     ZKSumcheckData<Flavor>& zk_sumcheck_data)                         \
    {                                                                                                                  \
        SumcheckProver<Flavor> sumcheck(multivariate_n,                                                                \
                                        prover_polynomials,                                                            \
                                        transcript,                                                                    \
                                        alpha,                                                                         \
                                        gate_challenges,                                                               \
                                        relation_parameters,                                                           \
                                        virtual_log_n);                                                                \
        return sumcheck.prove(zk_sumcheck_data);                                                                       \
    }

DEFINE_PROVE_SUMCHECK(UltraFlavor);
DEFINE_PROVE_SUMCHECK(UltraKeccakFlavor);
DEFINE_PROVE_SUMCHECK(MegaFlavor);
DEFINE_PROVE_SUMCHECK(MegaAvmFlavor);

DEFINE_PROVE_ZK_SUMCHECK(UltraZKFlavor);
DEFINE_PROVE_ZK_SUMCHECK(UltraKeccakZKFlavor);
DEFINE_PROVE_ZK_SUMCHECK(MegaZKFlavor);

#ifdef STARKNET_GARAGA_FLAVORS
DEFINE_PROVE_SUMCHECK(UltraStarknetFlavor);
DEFINE_PROVE_ZK_SUMCHECK(UltraStarknetZKFlavor);
#endif

#undef DEFINE_PROVE_ZK_SUMCHECK
#undef DEFINE_PROVE_SUMCHECK

} // namespace bb
