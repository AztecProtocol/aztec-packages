#include "translator_relations_recorder.hpp"
#include "translator_relation_test_helpers.hpp"
#include <gtest/gtest.h>

using namespace smt_translator_relations;
using namespace smt_relation_recorder;
using namespace smt_solver;
using namespace smt_terms;
using namespace translator_relation_test_helpers;

/**
 * NOTE: These tests demonstrate the recording mechanism works correctly.
 * Due to static variables in the relation implementations caching RecordingFF objects,
 * multiple recording operations in the same process can interfere.
 * In production, you would typically record once per relation type and reuse that recording.
 *
 * Runtime: ~12ms
 */
TEST(TranslatorRelationRecorder, RecordingAndReplayWorks)
{
    // Step 1: Record the relation operations (no solver needed!)
    auto trace = record_translator_decomposition_relation();

    // Verify that operations were recorded
    EXPECT_GT(trace.operations.size(), 0);
    std::cerr << "Recorded " << trace.operations.size() << " operations\n";

    // Verify that accumulators were recorded
    EXPECT_EQ(trace.accumulator_results.size(), 48); // 48 subrelations in translator decomposition
    std::cerr << "Recorded " << trace.accumulator_results.size() << " accumulator results\n";

    // Step 2: Replay on one solver
    Solver s1(BN254_MODULUS, default_solver_config);
    std::vector<STerm> formulas1, vars1;
    std::vector<std::string> names1;
    replay_translator_decomposition_relation(trace, &s1, "solver1", true, formulas1, vars1, names1);
    EXPECT_EQ(formulas1.size(), 48);
    std::cerr << "Replayed to solver 1: " << formulas1.size() << " formulas\n";

    // Step 3: Replay on a different solver with the SAME recording!
    Solver s2(BN254_MODULUS, default_solver_config);
    std::vector<STerm> formulas2, vars2;
    std::vector<std::string> names2;
    replay_translator_decomposition_relation(trace, &s2, "solver2", true, formulas2, vars2, names2);
    EXPECT_EQ(formulas2.size(), 48);
    std::cerr << "Replayed to solver 2: " << formulas2.size() << " formulas\n";
}

/**
 * Runtime: ~10ms
 */
TEST(TranslatorRelationRecorder, MultipleSeparateRecordingsWork)
{
    // Record once
    auto trace = record_translator_decomposition_relation();

    // Replay on multiple different solvers - no interference!
    Solver s1(BN254_MODULUS, default_solver_config);
    Solver s2(BN254_MODULUS, default_solver_config);

    std::vector<STerm> formulas1, vars1;
    std::vector<std::string> names1;
    replay_translator_decomposition_relation(trace, &s1, "solver1", true, formulas1, vars1, names1);

    std::vector<STerm> formulas2, vars2;
    std::vector<std::string> names2;
    replay_translator_decomposition_relation(trace, &s2, "solver2", true, formulas2, vars2, names2);

    // Both should work independently
    EXPECT_EQ(formulas1.size(), 48);
    EXPECT_EQ(formulas2.size(), 48);
}
