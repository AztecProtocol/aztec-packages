use std::collections::{HashMap, HashSet};

use crate::checks::utils::{declared_committed_poly_ids, format_source};
use crate::expression_evaluation::{
    build_intermediates_map, collect_poly_ids_through_intermediates,
};
use powdr_ast::analyzed::{AlgebraicExpression, Analyzed, PolyID, PolynomialType};
use powdr_number::FieldElement;

/// A committed/witness column (including array elements) that appears in at least one identity,
/// but never co-occurs with any other column in the same identity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct IsolatedCommittedColumn {
    pub name: String,
    pub source: String,
}

/// Returns committed/witness columns that never appear together with any other column
/// in any identity (polynomial constraints, lookups, permutations, connect).
pub(crate) fn isolated_committed_columns<T: FieldElement>(
    analyzed: &Analyzed<T>,
) -> Vec<IsolatedCommittedColumn> {
    let declared_committed = declared_committed_poly_ids(analyzed);
    let connected = committed_poly_ids_with_any_cooccurrence(analyzed);

    declared_committed
        .into_iter()
        .filter(|(_poly_id, _name, _src)| !connected.contains(_poly_id)) // filter all committed polynomials that are not connected
        .map(|(_poly_id, name, source)| IsolatedCommittedColumn {
            name,
            source: format_source(&source),
        })
        .collect()
}

fn committed_poly_ids_with_any_cooccurrence<T: FieldElement>(
    analyzed: &Analyzed<T>,
) -> HashSet<PolyID> {
    let intermediates: HashMap<PolyID, &AlgebraicExpression<T>> = build_intermediates_map(analyzed);
    let mut poly_id_cache: HashMap<PolyID, HashSet<PolyID>> = HashMap::new();
    let mut connected: HashSet<PolyID> = HashSet::new();
    for identity in &analyzed.identities {
        let mut refs: HashSet<PolyID> = HashSet::new();
        for expr in identity
            .left
            .selector
            .iter()
            .chain(identity.left.expressions.iter())
            .chain(identity.right.selector.iter())
            .chain(identity.right.expressions.iter())
        {
            collect_poly_ids_through_intermediates(
                expr,
                &intermediates,
                &mut poly_id_cache,
                &mut refs,
            );
        }

        if refs.len() <= 1 {
            continue;
        }

        for poly_id in refs.iter() {
            if poly_id.ptype == PolynomialType::Committed {
                connected.insert(*poly_id);
            }
        }
    }

    connected
}

#[cfg(test)]
mod tests {
    use super::isolated_committed_columns;
    use powdr_number::GoldilocksField;
    use powdr_pil_analyzer::analyze_string;

    #[test]
    fn isolated_if_only_self_constrained() {
        let input = r#"
            namespace N(16);
            pol commit a;
            (a - 1) * a = 0;
        "#;
        let analyzed = analyze_string::<GoldilocksField>(input);
        let isolated = isolated_committed_columns(&analyzed);

        assert!(
            isolated.len() == 1,
            "expected 1 isolated column, got: {isolated:?}"
        );
        assert!(
            isolated[0].name == "N.a",
            "expected N.a to be isolated, got: {isolated:?}"
        );
    }

    #[test]
    fn not_isolated_when_constrained_with_other_committed() {
        let input = r#"
            namespace N(16);
            pol commit a;
            pol commit b;
            a - b = 0;
        "#;
        let analyzed = analyze_string::<GoldilocksField>(input);
        let isolated = isolated_committed_columns(&analyzed);

        assert!(
            isolated.len() == 0,
            "expected no isolated columns, got: {isolated:?}"
        );
    }

    #[test]
    fn test_dead_columns() {
        let input = r#"
            pol commit a;
        "#;
        let analyzed = analyze_string::<GoldilocksField>(input);
        let isolated = isolated_committed_columns(&analyzed);
        assert!(
            isolated.len() == 1,
            "expected 1 isolated column, got: {isolated:?}"
        );
        assert!(
            isolated[0].name == "a",
            "expected a to be isolated, got: {isolated:?}"
        );
    }

    #[test]
    fn isolated_if_only_used_in_unused_intermediate() {
        let input = r#"
            namespace N(16);
            pol commit a;
            pol X = a + 1;
        "#;
        let analyzed = analyze_string::<GoldilocksField>(input);
        let isolated = isolated_committed_columns(&analyzed);

        assert!(
            isolated.len() == 1,
            "expected 1 isolated column, got: {isolated:?}"
        );
        assert!(
            isolated[0].name == "N.a",
            "expected N.a to be isolated, got: {isolated:?}"
        );
    }

    #[test]
    fn not_isolated_when_used_in_lookup_identity() {
        let input = r#"
            namespace N(16);
            pol commit sel;
            pol commit a;
            pol commit table;
            // Use `a` only through a lookup identity; this should count as co-occurrence.
            sel { a } in table { table };
        "#;
        let analyzed = analyze_string::<GoldilocksField>(input);
        let isolated = isolated_committed_columns(&analyzed);

        assert!(
            isolated.len() == 0,
            "expected no isolated columns, got: {isolated:?}"
        );
    }
}
