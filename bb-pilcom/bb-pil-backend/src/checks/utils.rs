use powdr_ast::analyzed::{Analyzed, PolyID, PolynomialType, SymbolKind};
use powdr_number::FieldElement;
use powdr_parser_util::SourceRef;

pub(crate) fn declared_committed_poly_ids<T: FieldElement>(
    analyzed: &Analyzed<T>,
) -> Vec<(PolyID, String, SourceRef)> {
    analyzed
        .definitions
        .iter()
        .filter(|(_, (sym, _))| matches!(sym.kind, SymbolKind::Poly(PolynomialType::Committed))) // filter all committed polynomials
        .flat_map(|(_name, (sym, _def))| {
            sym.array_elements()
                .map(|(elem_name, poly_id)| (poly_id, elem_name, sym.source.clone()))
                .collect::<Vec<_>>()
        })
        .collect()
}

pub(crate) fn format_source(source: &SourceRef) -> String {
    let file = source
        .file_name
        .as_ref()
        .map(|s| s.as_ref())
        .unwrap_or("<unknown>");
    format!("{file}:{}..{}", source.start, source.end)
}
