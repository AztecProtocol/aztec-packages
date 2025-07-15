#pragma once

#include "barretenberg/vm2/common/expression.hpp"

namespace bb::avm2 {

/**
 * @brief Returns the degree of an expression.
 *
 * It can be used at copile time.
 */
class DegreeExpressionEvaluator {
  public:
    static constexpr size_t evaluate(const ConstantExpression&) { return 0; }
    static constexpr size_t evaluate(const ColumnExpression&) { return 1; }

    template <typename InnerType> static constexpr size_t evaluate(const NegExpression<InnerType>& expression)
    {
        return evaluate(expression.inner);
    }

    template <typename LhsType, typename RhsType>
    static constexpr size_t evaluate(const AddExpression<LhsType, RhsType>& expression)
    {
        return std::max(evaluate(expression.lhs), evaluate(expression.rhs));
    }

    template <typename LhsType, typename RhsType>
    static constexpr size_t evaluate(const SubExpression<LhsType, RhsType>& expression)
    {
        return std::max(evaluate(expression.lhs), evaluate(expression.rhs));
    }

    template <typename LhsType, typename RhsType>
    static constexpr size_t evaluate(const MulExpression<LhsType, RhsType>& expression)
    {
        return evaluate(expression.lhs) + evaluate(expression.rhs);
    }
};

/**
 * @brief Evaluates an expression to a value.
 */
template <typename ValueType> class ValueExpressionEvaluator {
  public:
    using ColumnEvaluator = std::function<ValueType(const ColumnExpression&)>;
    ValueExpressionEvaluator(ColumnEvaluator column_evaluator)
        : column_evaluator_(std::move(column_evaluator))
    {}

    ValueType evaluate(const ConstantExpression& expression) const { return expression.value; }
    ValueType evaluate(const ColumnExpression& expression) const { return column_evaluator_(expression); }

    template <typename InnerType> ValueType evaluate(const NegExpression<InnerType>& expression) const
    {
        return -evaluate(expression.inner);
    }

    template <typename LhsType, typename RhsType>
    ValueType evaluate(const AddExpression<LhsType, RhsType>& expression) const
    {
        return evaluate(expression.lhs) + evaluate(expression.rhs);
    }

    template <typename LhsType, typename RhsType>
    ValueType evaluate(const SubExpression<LhsType, RhsType>& expression) const
    {
        return evaluate(expression.lhs) - evaluate(expression.rhs);
    }

    template <typename LhsType, typename RhsType>
    ValueType evaluate(const MulExpression<LhsType, RhsType>& expression) const
    {
        return evaluate(expression.lhs) * evaluate(expression.rhs);
    }

  private:
    ColumnEvaluator column_evaluator_;
};
} // namespace bb::avm2
