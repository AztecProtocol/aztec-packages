use powdr_ast::analyzed::{
    AlgebraicBinaryOperation, AlgebraicBinaryOperator, AlgebraicExpression, AlgebraicReference,
    AlgebraicUnaryOperation, AlgebraicUnaryOperator,
};
use num_bigint::BigInt;
use powdr_number::FieldElement;
use std::collections::BTreeSet;
use std::path::Path;

pub fn namespace_of(col_name: &str) -> String {
    col_name
        .split('.')
        .next()
        .unwrap_or(col_name)
        .to_string()
}

/// Extract a short relative path from a SourceRef file name.
///
/// Keeps up to 2 trailing path components so that files in subdirectories
/// retain their subdirectory prefix (e.g., "opcodes/sload.pil"), while
/// top-level files stay as just "alu.pil". The "vm2" and "pil" parents
/// are filtered out since they're not meaningful for audit consumers.
pub fn short_path(full_path: &str) -> String {
    let p = Path::new(full_path);
    let components: Vec<_> = p.components().rev().take(2).collect();
    if components.len() == 2 {
        let parent = components[1].as_os_str().to_string_lossy();
        let file = components[0].as_os_str().to_string_lossy();
        if parent != "vm2" && parent != "pil" {
            return format!("{}/{}", parent, file);
        }
        return file.into_owned();
    }
    p.file_name()
        .map(|f| f.to_string_lossy().into_owned())
        .unwrap_or_else(|| full_path.to_string())
}

pub fn format_source_ref(source: &powdr_parser_util::SourceRef) -> String {
    let file = source
        .file_name
        .as_ref()
        .map(|s| short_path(s.as_ref()))
        .unwrap_or_else(|| "<unknown>".to_string());

    if let Some(contents) = &source.file_contents {
        let line = contents[..source.start.min(contents.len())]
            .chars()
            .filter(|c| *c == '\n')
            .count()
            + 1;
        format!("{}:{}", file, line)
    } else {
        format!("{}:{}", file, source.start)
    }
}

pub fn short_source_file(source: &powdr_parser_util::SourceRef) -> Option<String> {
    source.file_name.as_ref().map(|s| short_path(s.as_ref()))
}

/// Collect all AlgebraicReference names from an expression tree.
pub fn collect_column_names<T>(expr: &AlgebraicExpression<T>, out: &mut BTreeSet<String>) {
    match expr {
        AlgebraicExpression::Reference(r) => {
            let mut name = r.name.clone();
            if r.next {
                name = format!("{}'", name);
            }
            out.insert(name);
        }
        AlgebraicExpression::BinaryOperation(op) => {
            collect_column_names(&op.left, out);
            collect_column_names(&op.right, out);
        }
        AlgebraicExpression::UnaryOperation(op) => {
            collect_column_names(&op.expr, out);
        }
        AlgebraicExpression::PublicReference(_)
        | AlgebraicExpression::Challenge(_)
        | AlgebraicExpression::Number(_) => {}
    }
}

/// Collect all AlgebraicReference structs (with full poly_id, next info) from an expression.
#[allow(dead_code)]
pub fn collect_references<'a, T>(
    expr: &'a AlgebraicExpression<T>,
    out: &mut Vec<&'a AlgebraicReference>,
) {
    match expr {
        AlgebraicExpression::Reference(r) => {
            out.push(r);
        }
        AlgebraicExpression::BinaryOperation(op) => {
            collect_references(&op.left, out);
            collect_references(&op.right, out);
        }
        AlgebraicExpression::UnaryOperation(op) => {
            collect_references(&op.expr, out);
        }
        AlgebraicExpression::PublicReference(_)
        | AlgebraicExpression::Challenge(_)
        | AlgebraicExpression::Number(_) => {}
    }
}

/// Check if an expression represents `col * (1 - col)` for some column reference.
/// Returns the column name if so.
pub fn detect_boolean_constraint<T: FieldElement>(
    expr: &AlgebraicExpression<T>,
) -> Option<String> {
    // Unwrap the `expr - 0` wrapper if present
    let inner = if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Sub,
        right,
    }) = expr
    {
        if let AlgebraicExpression::Number(n) = right.as_ref() {
            if *n == T::from(0u32) {
                left.as_ref()
            } else {
                expr
            }
        } else {
            expr
        }
    } else {
        expr
    };

    if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Mul,
        right,
    }) = inner
    {
        if let Some(name) = try_match_bool_pattern(left, right) {
            return Some(name);
        }
        if let Some(name) = try_match_bool_pattern(right, left) {
            return Some(name);
        }
    }
    None
}

fn try_match_bool_pattern<T: FieldElement>(
    col_side: &AlgebraicExpression<T>,
    complement_side: &AlgebraicExpression<T>,
) -> Option<String> {
    let col_ref = match col_side {
        AlgebraicExpression::Reference(r) => r,
        _ => return None,
    };

    if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Sub,
        right,
    }) = complement_side
    {
        if let AlgebraicExpression::Number(n) = left.as_ref() {
            if *n == T::from(1u32) {
                if let AlgebraicExpression::Reference(r2) = right.as_ref() {
                    if r2.name == col_ref.name && r2.poly_id == col_ref.poly_id {
                        return Some(col_ref.name.clone());
                    }
                }
            }
        }
    }
    None
}

/// Extract the name from a selector/column expression.
pub fn get_ref_name<T>(expr: &AlgebraicExpression<T>) -> Option<String> {
    match expr {
        AlgebraicExpression::Reference(a_ref) => {
            let mut name = a_ref.name.clone();
            if a_ref.next {
                name = format!("{}'", name);
            }
            Some(name)
        }
        _ => None,
    }
}

/// Format a field element for JSON output: decimal if < 2^64, 0x-hex otherwise.
pub fn format_field_json<F: FieldElement>(n: &F) -> String {
    let number: BigInt = BigInt::from_bytes_le(num_bigint::Sign::Plus, &n.to_bytes_le());
    if number.bits() < 64 {
        format!("{}", number)
    } else {
        format!("0x{:x}", number)
    }
}

/// Render an AlgebraicExpression as a human-readable math string.
/// Uses standard precedence, `**` for Pow, `'` for next, decimal/hex for numbers.
pub fn render_expression<T: FieldElement>(expr: &AlgebraicExpression<T>) -> String {
    render_expr_inner(expr, None, false)
}

fn render_expr_inner<T: FieldElement>(
    expr: &AlgebraicExpression<T>,
    parent_precedence: Option<u8>,
    is_right_of_sub: bool,
) -> String {
    match expr {
        AlgebraicExpression::Number(n) => format_field_json(n),
        AlgebraicExpression::Reference(r) => {
            if r.next {
                format!("{}'", r.name)
            } else {
                r.name.clone()
            }
        }
        AlgebraicExpression::PublicReference(name) => format!("public:{}", name),
        AlgebraicExpression::Challenge(c) => format!("challenge[{}]", c.id),
        AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation { left, op, right }) => {
            let prec = op_precedence(op);
            let op_str = match op {
                AlgebraicBinaryOperator::Add => " + ",
                AlgebraicBinaryOperator::Sub => " - ",
                AlgebraicBinaryOperator::Mul => " * ",
                AlgebraicBinaryOperator::Pow => " ** ",
            };

            let left_str = render_expr_inner(left, Some(prec), false);
            let right_needs_parens = matches!(op, AlgebraicBinaryOperator::Sub);
            let right_str = render_expr_inner(right, Some(prec), right_needs_parens);

            let result = format!("{}{}{}", left_str, op_str, right_str);

            let needs_parens = if let Some(pp) = parent_precedence {
                prec > pp || (prec == pp && is_right_of_sub)
            } else {
                false
            };

            if needs_parens {
                format!("({})", result)
            } else {
                result
            }
        }
        AlgebraicExpression::UnaryOperation(AlgebraicUnaryOperation { op, expr: operand }) => {
            match op {
                AlgebraicUnaryOperator::Minus => {
                    let inner = render_expr_inner(operand, Some(0), false);
                    match operand.as_ref() {
                        AlgebraicExpression::BinaryOperation(_) => format!("-({})", inner),
                        _ => format!("-{}", inner),
                    }
                }
            }
        }
    }
}

/// Precedence: lower number = higher priority (binds tighter).
/// Pow=1, Mul=2, Add/Sub=3
fn op_precedence(op: &AlgebraicBinaryOperator) -> u8 {
    match op {
        AlgebraicBinaryOperator::Pow => 1,
        AlgebraicBinaryOperator::Mul => 2,
        AlgebraicBinaryOperator::Add | AlgebraicBinaryOperator::Sub => 3,
    }
}
