#include "barretenberg/vm2/common/expression_evaluation.hpp"

namespace bb::avm2 {

static_assert(DegreeExpressionEvaluator::evaluate(ConstantExpression(33) +
                                                  ColumnExpression(ColumnAndShifts::memory_clk)) == 1);
static_assert(DegreeExpressionEvaluator::evaluate(ColumnExpression(ColumnAndShifts::context_stack_is_static) *
                                                  ColumnExpression(ColumnAndShifts::memory_clk)) == 2);
static_assert(DegreeExpressionEvaluator::evaluate(-ConstantExpression(33)) == 0);
static_assert(DegreeExpressionEvaluator::evaluate(-ColumnExpression(ColumnAndShifts::memory_clk)) == 1);
static_assert(DegreeExpressionEvaluator::evaluate(-(-ConstantExpression(33))) == 0);
static_assert(DegreeExpressionEvaluator::evaluate(-(-ColumnExpression(ColumnAndShifts::memory_clk))) == 1);
static_assert(DegreeExpressionEvaluator::evaluate(ConstantExpression(33) -
                                                  ColumnExpression(ColumnAndShifts::memory_clk)) == 1);
static_assert(DegreeExpressionEvaluator::evaluate(ColumnExpression(ColumnAndShifts::context_stack_is_static) -
                                                  ColumnExpression(ColumnAndShifts::memory_clk)) == 1);
static_assert(DegreeExpressionEvaluator::evaluate(ConstantExpression(33) *
                                                  ColumnExpression(ColumnAndShifts::memory_clk)) == 1);
static_assert(DegreeExpressionEvaluator::evaluate(ColumnExpression(ColumnAndShifts::context_stack_is_static) *
                                                  ColumnExpression(ColumnAndShifts::memory_clk)) == 2);

} // namespace bb::avm2
