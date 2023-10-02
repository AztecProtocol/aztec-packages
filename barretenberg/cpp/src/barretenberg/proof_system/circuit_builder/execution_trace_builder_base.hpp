#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/proof_system/arithmetization/arithmetization.hpp"
#include "barretenberg/proof_system/relations/relation_parameters.hpp"
#include <utility>

namespace proof_system {
static constexpr uint32_t DUMMY_TAG = 0;

template <typename Arithmetization> class ExecutionTraceBuilderBase {
  public:
    using FF = typename Arithmetization::FF;
    static constexpr size_t NUM_WIRES = Arithmetization::NUM_WIRES;
    size_t num_gates = 0;
    // WORKTODO: move public inputs logic into here

    bool _failed = false;
    std::string _err;

    ExecutionTraceBuilderBase([[maybe_unused]] size_t size_hint = 0){};
    ExecutionTraceBuilderBase(const ExecutionTraceBuilderBase& other) = default;
    ExecutionTraceBuilderBase(ExecutionTraceBuilderBase&& other) noexcept = default;
    ExecutionTraceBuilderBase& operator=(const ExecutionTraceBuilderBase& other) = default;
    ExecutionTraceBuilderBase& operator=(ExecutionTraceBuilderBase&& other) noexcept = default;
    virtual ~ExecutionTraceBuilderBase() = default;

    [[nodiscard]] bool failed() const { return _failed; };
    [[nodiscard]] const std::string& err() const { return _err; };

    void set_err(std::string msg) { _err = std::move(msg); }
    void failure(std::string msg)
    {
        _failed = true;
        set_err(msg);
    }

    template <typename Relation, typename Row>
    bool evaluate_relation(const std::string& relation_name, std::vector<Row>& rows)
    {
        typename Relation::RelationValues value_accumulator;
        for (auto& subrelation_value_accumulator : value_accumulator) {
            subrelation_value_accumulator = 0;
        }

        constexpr size_t NUM_SUBRELATIONS = value_accumulator.size();

        auto pow_zeta = FF::random_element();
        auto params = RelationParameters<FF>::get_random();

        for (size_t idx = 0; idx < rows.size(); ++idx) {
            Relation::add_full_relation_value_contribution(value_accumulator, rows[idx], params, pow_zeta);
            bool some_subrelation_failed = false;
            for (size_t subrelation_idx = 0; subrelation_idx < NUM_SUBRELATIONS; ++subrelation_idx) {
                if (value_accumulator[subrelation_idx] != 0) {
                    info(relation_name, " fails at row index ", idx, ", subrelation index ", subrelation_idx);
                    some_subrelation_failed = true;
                }
            }
            if (some_subrelation_failed) {
                return false;
            }
        }
        return true;
    };
};

} // namespace proof_system
