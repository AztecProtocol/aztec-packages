#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {

/**
 * @brief Relation expression representing a constant value.
 */
struct ConstantExpression {
    FF value;
    static constexpr bool __IS_EXPRESSION__ = true;

    constexpr explicit ConstantExpression(FF value)
        : value(value)
    {}
};

/**
 * @brief Relation expression representing a column.
 */
struct ColumnExpression {
    ColumnAndShifts column;
    static constexpr bool __IS_EXPRESSION__ = true;

    constexpr explicit ColumnExpression(ColumnAndShifts column)
        : column(column)
    {}
};

/**
 * @brief Relation expression representing a unary negation.
 */
template <typename InnerType> struct NegExpression {
    InnerType inner;
    static constexpr bool __IS_EXPRESSION__ = true;

    constexpr explicit NegExpression(InnerType inner)
        : inner(std::forward<InnerType>(inner))
    {}
};

/**
 * @brief Relation expression representing an addition.
 */
template <typename LhsType, typename RhsType> struct AddExpression {
    LhsType lhs;
    RhsType rhs;

    constexpr explicit AddExpression(LhsType&& lhs, RhsType&& rhs)
        : lhs(std::forward<LhsType>(lhs))
        , rhs(std::forward<RhsType>(rhs))
    {}
};

/**
 * @brief Relation expression representing a subtraction.
 */
template <typename LhsType, typename RhsType> struct SubExpression {
    LhsType lhs;
    RhsType rhs;
    static constexpr bool __IS_EXPRESSION__ = true;

    constexpr explicit SubExpression(LhsType&& lhs, RhsType&& rhs)
        : lhs(std::forward<LhsType>(lhs))
        , rhs(std::forward<RhsType>(rhs))
    {}
};

/**
 * @brief Relation expression representing a multiplication.
 */
template <typename LhsType, typename RhsType> struct MulExpression {
    LhsType lhs;
    RhsType rhs;
    static constexpr bool __IS_EXPRESSION__ = true;

    constexpr explicit MulExpression(LhsType&& lhs, RhsType&& rhs)
        : lhs(std::forward<LhsType>(lhs))
        , rhs(std::forward<RhsType>(rhs))
    {}
};

template <typename InnerType>
constexpr NegExpression<InnerType> operator-(InnerType&& inner)
    requires(InnerType::__IS_EXPRESSION__)
{
    return NegExpression<InnerType>(std::forward<InnerType>(inner));
}

template <typename LhsType, typename RhsType>
constexpr AddExpression<LhsType, RhsType> operator+(LhsType&& lhs, RhsType&& rhs)
    requires(LhsType::__IS_EXPRESSION__ && RhsType::__IS_EXPRESSION__)
{
    return AddExpression<LhsType, RhsType>(std::forward<LhsType>(lhs), std::forward<RhsType>(rhs));
}

template <typename LhsType, typename RhsType>
constexpr SubExpression<LhsType, RhsType> operator-(LhsType&& lhs, RhsType&& rhs)
    requires(LhsType::__IS_EXPRESSION__ && RhsType::__IS_EXPRESSION__)
{
    return SubExpression<LhsType, RhsType>(std::forward<LhsType>(lhs), std::forward<RhsType>(rhs));
}

template <typename LhsType, typename RhsType>
constexpr MulExpression<LhsType, RhsType> operator*(LhsType&& lhs, RhsType&& rhs)
    requires(LhsType::__IS_EXPRESSION__ && RhsType::__IS_EXPRESSION__)
{
    return MulExpression<LhsType, RhsType>(std::forward<LhsType>(lhs), std::forward<RhsType>(rhs));
}

} // namespace bb::avm2
