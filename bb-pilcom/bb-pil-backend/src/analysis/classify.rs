use crate::analysis::helpers::{collect_column_names, detect_boolean_constraint};

use powdr_ast::analyzed::{
    AlgebraicBinaryOperation, AlgebraicBinaryOperator, AlgebraicExpression, Identity, IdentityKind,
};
use powdr_number::FieldElement;
use std::collections::{BTreeMap, BTreeSet, HashSet};

/// Classify all identities. Returns a map from identity_id -> list of classification labels.
pub fn classify_all<F: FieldElement>(
    raw_identities: &[Identity<AlgebraicExpression<F>>],
    inlined_identities: &[Identity<AlgebraicExpression<F>>],
    boolean_cols: &HashSet<String>,
) -> BTreeMap<u64, Vec<String>> {
    let inlined_map: BTreeMap<u64, &Identity<AlgebraicExpression<F>>> =
        inlined_identities.iter().map(|id| (id.id, id)).collect();

    let mut result = BTreeMap::new();

    for identity in raw_identities {
        let mut labels = BTreeSet::new();

        // Classify on raw expression
        classify_identity(identity, boolean_cols, &mut labels);

        // Classify on inlined expression too — union the results
        if let Some(inlined) = inlined_map.get(&identity.id) {
            classify_identity(inlined, boolean_cols, &mut labels);
        }

        // Fallback
        if labels.is_empty() {
            labels.insert("unclassified".to_string());
        }

        result.insert(identity.id, labels.into_iter().collect());
    }

    result
}

fn classify_identity<F: FieldElement>(
    identity: &Identity<AlgebraicExpression<F>>,
    boolean_cols: &HashSet<String>,
    labels: &mut BTreeSet<String>,
) {
    // Get the main expression for polynomial identities
    let poly_expr = if identity.kind == IdentityKind::Polynomial {
        identity.left.selector.as_ref()
    } else {
        None
    };

    // Boolean check
    if let Some(expr) = poly_expr {
        if detect_boolean_constraint(expr).is_some() {
            labels.insert("boolean".to_string());
            return; // Boolean constraints are simple; no other label needed
        }
    }

    // Collect all column names used
    let mut all_cols = BTreeSet::new();
    if let Some(sel) = &identity.left.selector {
        collect_column_names(sel, &mut all_cols);
    }
    for expr in &identity.left.expressions {
        collect_column_names(expr, &mut all_cols);
    }
    if let Some(sel) = &identity.right.selector {
        collect_column_names(sel, &mut all_cols);
    }
    for expr in &identity.right.expressions {
        collect_column_names(expr, &mut all_cols);
    }

    let col_names_str: Vec<&str> = all_cols.iter().map(|s| s.as_str()).collect();

    // Range check: lookup with right-side referencing range_check or precomputed.sel_range
    if identity.kind == IdentityKind::Plookup {
        let mut right_cols = BTreeSet::new();
        if let Some(sel) = &identity.right.selector {
            collect_column_names(sel, &mut right_cols);
        }
        for expr in &identity.right.expressions {
            collect_column_names(expr, &mut right_cols);
        }
        if right_cols
            .iter()
            .any(|c| c.contains("range_check") || c.contains("sel_range"))
        {
            labels.insert("range_check".to_string());
        }
    }

    // Selector-gated detection for polynomial identities
    let is_selector_gated = if let Some(expr) = poly_expr {
        is_gated_by_boolean(expr, boolean_cols)
    } else {
        false
    };

    if is_selector_gated {
        labels.insert("selector_gated".to_string());
    }

    // Initialization: references column named *first_row*
    if col_names_str
        .iter()
        .any(|c| c.contains("first_row") || c.contains("FIRST"))
    {
        labels.insert("initialization".to_string());
    }

    // Propagation: has col' and same col unshifted
    let shifted: HashSet<&str> = all_cols
        .iter()
        .filter(|c| c.ends_with('\''))
        .map(|c| c.trim_end_matches('\''))
        .collect();
    let unshifted: HashSet<&str> = all_cols
        .iter()
        .filter(|c| !c.ends_with('\''))
        .map(|c| c.as_str())
        .collect();
    let has_both = shifted.iter().any(|s| unshifted.contains(s));
    if has_both && identity.kind == IdentityKind::Polynomial {
        if let Some(expr) = poly_expr {
            let deg = crate::expression_evaluation::get_expression_degree(expr);
            if deg >= 2 {
                labels.insert("propagation".to_string());
            }
        }
    }

    // Continuity: pattern involves (1 - X) and shifted/unshifted of same col
    if identity.kind == IdentityKind::Polynomial && has_both {
        if let Some(expr) = poly_expr {
            if has_one_minus_pattern(expr) {
                labels.insert("continuity".to_string());
            }
        }
    }

    // Zero check: references *inv* column, degree >= 3, polynomial
    if identity.kind == IdentityKind::Polynomial {
        if col_names_str.iter().any(|c| c.contains("inv")) {
            if let Some(expr) = poly_expr {
                let deg = crate::expression_evaluation::get_expression_degree(expr);
                if deg >= 3 {
                    labels.insert("zero_check".to_string());
                }
            }
        }
    }

    // Decomposition: references array-indexed columns, multiple Mul-by-constant terms
    if col_names_str.iter().any(|c| c.contains('[')) {
        if identity.kind == IdentityKind::Polynomial {
            if let Some(expr) = poly_expr {
                if count_mul_by_constant(expr) >= 2 {
                    labels.insert("decomposition".to_string());
                }
            }
        }
    }

    // Error aggregation: pattern `a + b - a*b`
    if identity.kind == IdentityKind::Polynomial {
        if let Some(expr) = poly_expr {
            if has_error_aggregation_pattern(expr) {
                labels.insert("error_aggregation".to_string());
            }
        }
    }

    // Arithmetic: selector-gated polynomial not matching any of the above specific patterns
    if is_selector_gated
        && identity.kind == IdentityKind::Polynomial
        && !labels
            .iter()
            .any(|l| matches!(l.as_str(), "propagation" | "continuity" | "zero_check" | "decomposition" | "error_aggregation" | "initialization" | "range_check"))
    {
        labels.insert("arithmetic".to_string());
    }
}

/// Check if an expression's outermost multiplication has a boolean reference.
fn is_gated_by_boolean<F: FieldElement>(
    expr: &AlgebraicExpression<F>,
    boolean_cols: &HashSet<String>,
) -> bool {
    // Unwrap the `expr - 0` wrapper
    let inner = unwrap_sub_zero(expr);

    if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Mul,
        right,
    }) = inner
    {
        if let AlgebraicExpression::Reference(r) = left.as_ref() {
            if boolean_cols.contains(&r.name) {
                return true;
            }
        }
        if let AlgebraicExpression::Reference(r) = right.as_ref() {
            if boolean_cols.contains(&r.name) {
                return true;
            }
        }
    }
    false
}

fn unwrap_sub_zero<'a, F: FieldElement>(
    expr: &'a AlgebraicExpression<F>,
) -> &'a AlgebraicExpression<F> {
    if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Sub,
        right,
    }) = expr
    {
        if let AlgebraicExpression::Number(n) = right.as_ref() {
            if *n == F::from(0u32) {
                return left.as_ref();
            }
        }
    }
    expr
}

fn has_one_minus_pattern<F: FieldElement>(expr: &AlgebraicExpression<F>) -> bool {
    match expr {
        AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation { left, op, right }) => {
            // Check for (1 - X)
            if *op == AlgebraicBinaryOperator::Sub {
                if let AlgebraicExpression::Number(n) = left.as_ref() {
                    if *n == F::from(1u32) {
                        return true;
                    }
                }
            }
            has_one_minus_pattern(left) || has_one_minus_pattern(right)
        }
        AlgebraicExpression::UnaryOperation(u) => has_one_minus_pattern(&u.expr),
        _ => false,
    }
}

fn count_mul_by_constant<F>(expr: &AlgebraicExpression<F>) -> usize {
    match expr {
        AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation { left, op, right }) => {
            let mut count = 0;
            if *op == AlgebraicBinaryOperator::Mul {
                if matches!(left.as_ref(), AlgebraicExpression::Number(_))
                    || matches!(right.as_ref(), AlgebraicExpression::Number(_))
                {
                    count += 1;
                }
            }
            count + count_mul_by_constant(left) + count_mul_by_constant(right)
        }
        AlgebraicExpression::UnaryOperation(u) => count_mul_by_constant(&u.expr),
        _ => 0,
    }
}

fn has_error_aggregation_pattern<F: FieldElement>(expr: &AlgebraicExpression<F>) -> bool {
    // Look for `a + b - a*b` pattern at any level.
    // This is a simplified heuristic: check if expression has both Add and Mul sub-trees
    // and at least one Sub connecting them.
    match expr {
        AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation { left, op, right }) => {
            if *op == AlgebraicBinaryOperator::Sub {
                // Check if left is an Add and right is a Mul (or vice versa)
                let left_has_add = has_op(left, AlgebraicBinaryOperator::Add);
                let right_has_mul = has_op(right, AlgebraicBinaryOperator::Mul);
                if left_has_add && right_has_mul {
                    return true;
                }
            }
            has_error_aggregation_pattern(left) || has_error_aggregation_pattern(right)
        }
        AlgebraicExpression::UnaryOperation(u) => has_error_aggregation_pattern(&u.expr),
        _ => false,
    }
}

fn has_op<F>(expr: &AlgebraicExpression<F>, target: AlgebraicBinaryOperator) -> bool {
    match expr {
        AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation { left, op, right }) => {
            *op == target || has_op(left, target) || has_op(right, target)
        }
        AlgebraicExpression::UnaryOperation(u) => has_op(&u.expr, target),
        _ => false,
    }
}
