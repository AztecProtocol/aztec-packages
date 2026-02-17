use powdr_ast::analyzed::{AlgebraicExpression, Analyzed, PolyID, PolynomialType, SymbolKind};
use std::collections::HashSet;
use powdr_number::FieldElement;
use powdr_parser_util::SourceRef;

pub(crate) fn declared_committed_poly_ids<T: FieldElement>(
    analyzed: &Analyzed<T>,
) -> Vec<(PolyID, String, SourceRef)> {
    analyzed
        .definitions
        .iter()
        .filter(|(_, (sym, _))| {
                matches!(sym.kind, SymbolKind::Poly(PolynomialType::Committed))
        }) // filter all committed polynomials
        .flat_map(|(_name, (sym, _def))| {
            sym.array_elements()
                .map(|(elem_name, poly_id)| (poly_id, elem_name, sym.source.clone()))
                .collect::<Vec<_>>()
        })
        .collect()
}

pub(crate) fn format_source(source: &SourceRef) -> String {
    let file = source.file_name.as_ref().map(|s| s.as_ref()).unwrap_or("<unknown>");
    format!("{file}:{}..{}", source.start, source.end)
}

pub(crate) fn collect_poly_ids<T>(expr: &AlgebraicExpression<T>, out: &mut HashSet<PolyID>) {
    match expr {
        AlgebraicExpression::Reference(r) => {
            out.insert(r.poly_id);
        }
        AlgebraicExpression::BinaryOperation(op) => {
            collect_poly_ids(&op.left, out);
            collect_poly_ids(&op.right, out);
        }
        AlgebraicExpression::UnaryOperation(op) => {
            collect_poly_ids(&op.expr, out);
        }
        AlgebraicExpression::PublicReference(_)
        | AlgebraicExpression::Challenge(_)
        | AlgebraicExpression::Number(_) => {}
    }
}
