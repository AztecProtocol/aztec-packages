use crate::utils::{format_field, sanitize_name};
use itertools::Itertools;

use std::collections::{HashMap, HashSet};

use powdr_ast::{
    analyzed::{
        AlgebraicBinaryOperation, AlgebraicBinaryOperator, AlgebraicExpression,
        AlgebraicUnaryOperation, AlgebraicUnaryOperator, Analyzed, Symbol,
    },
    parsed::visitor::ExpressionVisitable,
};
use powdr_number::FieldElement;

// A polynomial expression is a flattened and simplified PIL expression
// together with information about the placeholders.
// For example `{sel} - FF(0) + {some_alias}` is a polynomial expression with two placeholders.
// In this case, `sel` will be a column, and `some_alias` will be an alias.
#[derive(Debug, Clone)]
pub struct PolynomialExpression {
    // The flattened expression with column/aliases placeholders.
    // E.g.: `{sel} - FF(0) + {some_alias}`.
    // The placeholders are supposed to be replaced on "instantiation".
    pub pattern_with_placeholders: String,
    // The placeholders and their values, without the `{}` around them.
    pub placeholders: HashMap<String, ExpressionPlaceholder>,
}

// A placeholder is a column or an alias.
#[derive(Debug, Clone)]
pub enum ExpressionPlaceholder {
    Column(String),
    Alias(String),
}

impl PolynomialExpression {
    // The accumulate function in the relation needs instantiations that use `View`.
    pub fn instantiate_with_view(&self) -> String {
        self.instantiate_with_handler(|placeholder| match placeholder {
            ExpressionPlaceholder::Column(col) => format!("static_cast<View>(in.get(C::{}))", col),
            ExpressionPlaceholder::Alias(alias) => format!("CView({})", alias),
        })
    }

    // Other parts of the file do not use `View`.
    pub fn instantiate(&self) -> String {
        self.instantiate_with_handler(|placeholder| match placeholder {
            ExpressionPlaceholder::Column(col) => format!("in.get(C::{})", col),
            ExpressionPlaceholder::Alias(alias) => alias.clone(),
        })
    }

    // Once we want to write an expression to a file, we need to instantiate the placeholders.
    // This method creates an instantiated string given a way to instantiate the placeholders.
    fn instantiate_with_handler<F>(&self, handler: F) -> String
    where
        F: Fn(&ExpressionPlaceholder) -> String,
    {
        let mut result = self.pattern_with_placeholders.clone();
        for (key, placeholder) in &self.placeholders {
            let value_str = handler(placeholder);
            result = result.replace(format!("{{{}}}", key).as_str(), value_str.as_str());
        }
        result
    }

    /// Get the (one-level) aliases used in the expression.
    pub fn get_aliases(&self) -> HashSet<String> {
        self.placeholders
            .values()
            .filter_map(|placeholder| match placeholder {
                ExpressionPlaceholder::Alias(alias) => Some(alias.clone()),
                _ => None,
            })
            .collect::<HashSet<_>>()
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

fn merge_maps(
    placeholders1: HashMap<String, ExpressionPlaceholder>,
    placeholders2: HashMap<String, ExpressionPlaceholder>,
) -> HashMap<String, ExpressionPlaceholder> {
    placeholders1
        .into_iter()
        .chain(placeholders2.into_iter())
        .collect()
}

pub fn get_alias_expressions_in_order<F: FieldElement>(
    analyzed: &Analyzed<F>,
) -> Vec<(String, PolynomialExpression)> {
    let alias_polys_in_order = analyzed
        .intermediate_polys_in_source_order()
        .iter()
        .map(|(s, exprs)| {
            (
                s,
                // Only support the first expression for now.
                // I don't even know what more than one means.
                exprs.first().unwrap(),
            )
        })
        .collect_vec();

    let alias_names = alias_polys_in_order
        .iter()
        .map(|(sym, _)| sanitize_name(&sym.absolute_name))
        .collect::<HashSet<_>>();

    alias_polys_in_order
        .iter()
        .map(|(sym, pil_expr)| {
            let expr = compute_expression(pil_expr, &alias_names);
            (sanitize_name(&sym.absolute_name), expr)
        })
        .collect_vec()
}

pub fn get_expression_degree<F: FieldElement>(expr: &AlgebraicExpression<F>) -> u64 {
    match expr {
        AlgebraicExpression::Reference(_poly) => 1,
        AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation { left, op, right }) => {
            let lhs_degree = get_expression_degree(left);
            let rhs_degree = get_expression_degree(right);
            match op {
                AlgebraicBinaryOperator::Add => std::cmp::max(lhs_degree, rhs_degree),
                AlgebraicBinaryOperator::Sub => std::cmp::max(lhs_degree, rhs_degree),
                AlgebraicBinaryOperator::Mul => lhs_degree + rhs_degree,
                _ => unimplemented!("{:?}", op),
            }
        }
        AlgebraicExpression::UnaryOperation(AlgebraicUnaryOperation { op, expr: _ }) => match op {
            AlgebraicUnaryOperator::Minus => get_expression_degree(expr),
        },
        _ => 0,
    }
}

// We only try to remove parenthesis for ADD and MUL. This means
// that only child_expr for these cases are handled.
// Return true:
// - if child is MUL and parent is POW
// - if child is ADD and parent is POW, MUL, SUB or Unary Minus operator
fn has_parent_priority<F: FieldElement>(
    parent_expr: Option<&AlgebraicExpression<F>>,
    child_expr: &AlgebraicExpression<F>,
) -> bool {
    match child_expr {
        AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
            left: _,
            op,
            right: _,
        }) => match op {
            AlgebraicBinaryOperator::Mul => match parent_expr {
                Some(AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
                    left: _,
                    op,
                    right: _,
                })) => match op {
                    AlgebraicBinaryOperator::Pow => true,
                    _ => false,
                },
                _ => false,
            },
            AlgebraicBinaryOperator::Add => match parent_expr {
                Some(AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
                    left: _,
                    op,
                    right: _,
                })) => match op {
                    AlgebraicBinaryOperator::Pow
                    | AlgebraicBinaryOperator::Mul
                    | AlgebraicBinaryOperator::Sub => true,
                    _ => false,
                },
                Some(AlgebraicExpression::UnaryOperation(AlgebraicUnaryOperation {
                    op: operator,
                    expr: _,
                })) => match operator {
                    AlgebraicUnaryOperator::Minus => true,
                },
                _ => false,
            },
            _ => false,
        },
        _ => false,
    }
}

pub fn compute_expression<F: FieldElement>(
    current_expr: &AlgebraicExpression<F>,
    alias_names: &HashSet<String>,
) -> PolynomialExpression {
    compute_expression_(current_expr, alias_names, None)
}

fn compute_expression_<F: FieldElement>(
    current_expr: &AlgebraicExpression<F>,
    alias_names: &HashSet<String>,
    parent_expr: Option<&AlgebraicExpression<F>>,
) -> PolynomialExpression {
    let has_parent_priority = has_parent_priority(parent_expr, current_expr);
    match current_expr {
        AlgebraicExpression::Number(n) => PolynomialExpression {
            pattern_with_placeholders: format_field(n),
            placeholders: HashMap::new(),
        },
        AlgebraicExpression::Reference(polyref) => {
            let sanitized_name = sanitize_name(&polyref.name);
            if alias_names.contains(&sanitized_name) {
                // It's an alias.
                PolynomialExpression {
                    pattern_with_placeholders: format!("{{{}}}", sanitized_name),
                    placeholders: {
                        let mut map = HashMap::new();
                        map.insert(
                            sanitized_name.clone(),
                            ExpressionPlaceholder::Alias(sanitized_name),
                        );
                        map
                    },
                }
            } else {
                // It's a column.
                let mut poly_name = sanitized_name;
                if polyref.next {
                    poly_name = format!("{}_shift", poly_name);
                }

                PolynomialExpression {
                    pattern_with_placeholders: format!("{{{}}}", poly_name),
                    placeholders: {
                        let mut map = HashMap::new();
                        map.insert(poly_name.clone(), ExpressionPlaceholder::Column(poly_name));
                        map
                    },
                }
            }
        }
        AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
            left: lhe,
            op,
            right: rhe,
        }) => {
            let lhs = compute_expression_(lhe, alias_names, Some(current_expr));
            let rhs = compute_expression_(rhe, alias_names, Some(current_expr));

            match op {
                AlgebraicBinaryOperator::Add => {
                    let output: String;
                    if has_parent_priority {
                        output = format!(
                            "({} + {})",
                            lhs.pattern_with_placeholders, rhs.pattern_with_placeholders
                        );
                    } else {
                        output = format!(
                            "{} + {}",
                            lhs.pattern_with_placeholders, rhs.pattern_with_placeholders
                        );
                    }
                    PolynomialExpression {
                        pattern_with_placeholders: output,
                        placeholders: merge_maps(lhs.placeholders, rhs.placeholders),
                    }
                }
                AlgebraicBinaryOperator::Sub => {
                    // There seem to be many cases where the rhs is a 0, try to avoid it.
                    if **rhe == AlgebraicExpression::Number(F::zero()) {
                        lhs
                    } else {
                        PolynomialExpression {
                            pattern_with_placeholders: format!(
                                "({} - {})",
                                lhs.pattern_with_placeholders, rhs.pattern_with_placeholders
                            ),
                            placeholders: merge_maps(lhs.placeholders, rhs.placeholders),
                        }
                    }
                }
                AlgebraicBinaryOperator::Mul => {
                    let output: String;
                    if has_parent_priority {
                        output = format!(
                            "({} * {})",
                            lhs.pattern_with_placeholders, rhs.pattern_with_placeholders
                        );
                    } else {
                        output = format!(
                            "{} * {}",
                            lhs.pattern_with_placeholders, rhs.pattern_with_placeholders
                        );
                    }
                    PolynomialExpression {
                        pattern_with_placeholders: output,
                        placeholders: merge_maps(lhs.placeholders, rhs.placeholders),
                    }
                }
                _ => unimplemented!("{:?}", op),
            }
        }
        AlgebraicExpression::UnaryOperation(AlgebraicUnaryOperation {
            op: operator,
            expr: rec_expr,
        }) => match operator {
            AlgebraicUnaryOperator::Minus => {
                let e = compute_expression_(rec_expr, alias_names, None);
                PolynomialExpression {
                    pattern_with_placeholders: format!("-{}", e.pattern_with_placeholders),
                    placeholders: e.placeholders,
                }
            }
        },
        // Not currently used
        AlgebraicExpression::PublicReference(_) => unimplemented!("{:?}", current_expr),
        // Challenges are not being used in our current pil construction
        AlgebraicExpression::Challenge(_) => unimplemented!("{:?}", current_expr),
    }
}
