#include "barretenberg/vm/generated/AvmMini_composer.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/generated/AvmMini_flavor.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/proof_system/circuit_builder/generated/AvmMini_trace.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/vm/generated/AvmMini_prover.hpp"
#include "barretenberg/vm/generated/AvmMini_verifier.hpp"
#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>
#include <string>
#include <vector>

using namespace proof_system::honk;

namespace example_relation_honk_composer {

class AvmMiniTests : public ::testing::Test {
  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { barretenberg::srs::init_crs_factory("../srs_db/ignition"); };
};

namespace {
auto& engine = numeric::random::get_debug_engine();
}

TEST_F(AvmMiniTests, basic)
{
    auto trace_builder = proof_system::AvmMiniTraceBuilder();
    auto circuit_builder = proof_system::AvmMiniCircuitBuilder();

    trace_builder.callDataCopy(0, 3, 2, std::vector<FF>{ 45, 23, 12 });

    // ctx.setFFMem(2, FF(45));
    // ctx.setFFMem(3, FF(23));
    // ctx.setFFMem(4, FF(12));

    trace_builder.add(2, 3, 4);
    trace_builder.add(4, 5, 5);
    // ctx.add(5, 5, 5);
    //  ctx.add(5, 5, 5);
    //  ctx.add(5, 5, 5);
    //  ctx.add(5, 5, 5);
    //  ctx.add(3, 5, 6);
    //  ctx.add(5, 6, 7);

    trace_builder.returnOP(1, 8);

    auto rows = trace_builder.finalize();

    info("Built circuit with ", rows.size(), " rows");

    for (size_t i = 0; i < 20; i++) {
        info("===============================");
        info("==        ROW ", i, "             ==");
        info("===============================");

        info("m_addr: ", rows[i].avmMini_m_addr);
        info("m_clk: ", rows[i].avmMini_m_clk);
        info("m_sub_clk: ", rows[i].avmMini_m_sub_clk);
        info("m_val: ", rows[i].avmMini_m_val);
        info("m_lastAccess: ", rows[i].avmMini_m_lastAccess);
        info("m_rw: ", rows[i].avmMini_m_rw);
        info("m_val_shift: ", rows[i].avmMini_m_val_shift);
        info("first: ", rows[i].avmMini_first);
        info("last: ", rows[i].avmMini_last);

        // info(rows[i].avmMini_m_val_shift);
        info("=======MEM_OP_A===========");
        info("clk: ", rows[i].avmMini_clk);
        info("mem_op_a: ", rows[i].avmMini_mem_op_a);
        info("mem_idx_a: ", rows[i].avmMini_mem_idx_a);
        info("ia: ", rows[i].avmMini_ia);
        info("rwa: ", rows[i].avmMini_rwa);

        info("=======MEM_OP_B===========");
        info("mem_op_b: ", rows[i].avmMini_mem_op_b);
        info("mem_idx_b: ", rows[i].avmMini_mem_idx_b);
        info("ib: ", rows[i].avmMini_ib);
        info("rwb: ", rows[i].avmMini_rwb);

        info("=======MEM_OP_C===========");
        info("mem_op_c: ", rows[i].avmMini_mem_op_c);
        info("mem_idx_c: ", rows[i].avmMini_mem_idx_c);
        info("ic: ", rows[i].avmMini_ic);
        info("rwc: ", rows[i].avmMini_rwc);
        info("\n");
    }

    circuit_builder.set_trace(std::move(rows));

    auto composer = AvmMiniComposer();

    ASSERT_TRUE(circuit_builder.check_circuit());

    auto prover = composer.create_prover(circuit_builder);
    auto proof = prover.construct_proof();

    auto verifier = composer.create_verifier(circuit_builder);
    bool verified = verifier.verify_proof(proof);
    ASSERT_TRUE(verified);

    info("We verified a proof!");
}

} // namespace example_relation_honk_composer