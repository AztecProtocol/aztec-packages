//! Checks if the graph built on columns as vertices and relations as edges is a single graph component.
//! sel columns are filtered out from the graph.
use crate::checks::utils::{collect_poly_ids, declared_committed_poly_ids, format_source};
use powdr_ast::analyzed::{Analyzed, PolyID, PolynomialType};
use powdr_number::FieldElement;
use powdr_parser_util::SourceRef;
use std::collections::{HashMap, HashSet};

#[derive(Clone)]
struct VertexInfo {
    name: String,
    source: SourceRef,
}

/// Returns true if the column is a `sel` column.
/// It's a special column that is used to select a subset of the committed columns and used almost everywhere.
/// So it's important to ignore it when checking if the graph is a single component.
fn is_sel_column(name: &str) -> bool {
    // for namespace.sel
    name.split('.').last().unwrap_or("").eq("sel")
}

fn add_undirected_edge(
    adjacency: &mut HashMap<PolyID, HashSet<PolyID>>,
    a: PolyID,
    b: PolyID,
) {
    if a == b {
        return;
    }
    adjacency.entry(a).or_default().insert(b);
    adjacency.entry(b).or_default().insert(a);
}

/// Returns the connected components of the graph.
fn components(vertices: &HashSet<PolyID>, adjacency: &HashMap<PolyID, HashSet<PolyID>>) -> Vec<HashSet<PolyID>> {
    let mut comps: Vec<HashSet<PolyID>> = Vec::new();
    let mut visited: HashSet<PolyID> = HashSet::new();

    for &v in vertices.iter() {
        if visited.contains(&v) {
            continue;
        }
        let mut comp: HashSet<PolyID> = HashSet::new();
        let mut stack = vec![v];
        while let Some(x) = stack.pop() {
            if visited.insert(x) {
                comp.insert(x);
                if let Some(neigh) = adjacency.get(&x) {
                    for &y in neigh {
                        if !visited.contains(&y) {
                            stack.push(y);
                        }
                    }
                }
            }
        }
        comps.push(comp);
    }

    comps
}

fn fmt_poly(poly_id: PolyID, info: &HashMap<PolyID, VertexInfo>) -> String {
    if let Some(v) = info.get(&poly_id) {
        format!("{}.{}", v.name, format_source(&v.source))
    } else {
        format!("{poly_id:?}")
    }
}

fn fmt_components_summary(
    comps: &[HashSet<PolyID>],
    info: &HashMap<PolyID, VertexInfo>,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    for comp in comps.iter() {
        let mut nodes: Vec<PolyID> = comp.iter().copied().collect();
        nodes.sort_by_key(|id| info.get(id).map(|v| v.name.clone()).unwrap_or_default());

        let sample: Vec<String> = nodes
            .iter()
            .map(|&id| fmt_poly(id, info))
            .collect();

        parts.push(format!("size={} sample=[{}]\n", comp.len(), sample.join(", ")));
    }
    parts.join("; ")
}

/// Checks if the graph built on columns as vertices and relations as edges is a single graph component.
pub(crate) fn single_graph_component_check<T: FieldElement>(analyzed: &Analyzed<T>) -> Result<(), String> {
    let declared_committed = declared_committed_poly_ids(analyzed);

    // Collect committed columns, excluding `sel`.
    let mut vertices: HashSet<PolyID> = HashSet::new();
    let mut info: HashMap<PolyID, VertexInfo> = HashMap::new();
    for (poly_id, name, source) in declared_committed {
        if is_sel_column(&name) {
            continue;
        }
        vertices.insert(poly_id);
        info.insert(poly_id, VertexInfo { name, source });
    }

    // Build edges
    let mut adjacency: HashMap<PolyID, HashSet<PolyID>> = HashMap::new();
    for &v in vertices.iter() {
        adjacency.entry(v).or_default();
    }

    for identity in analyzed.identities_with_inlined_intermediate_polynomials() {
        let mut refs: HashSet<PolyID> = HashSet::new();
        for expr in identity
            .left
            .selector
            .iter()
            .chain(identity.left.expressions.iter())
            .chain(identity.right.selector.iter())
            .chain(identity.right.expressions.iter())
        {
            collect_poly_ids(expr, &mut refs);
        }

        let mut committed_refs: Vec<PolyID> = refs
            .into_iter()
            .filter(|poly_id| poly_id.ptype == PolynomialType::Committed && vertices.contains(poly_id))
            .collect();
        committed_refs.sort();
        committed_refs.dedup();

        for i in 0..committed_refs.len() {
            for j in (i + 1)..committed_refs.len() {
                add_undirected_edge(&mut adjacency, committed_refs[i], committed_refs[j]);
            }
        }
    }

    let mut comps = components(&vertices, &adjacency);
    comps.sort_by_key(|c| c.len());

    if comps.len() > 1 {
        return Err(format!(
            "Graph is not a single component: number_of_components={}, {}",
            comps.len(),
            fmt_components_summary(&comps, &info)
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use powdr_number::GoldilocksField;
    use powdr_pil_analyzer::analyze_string;

    #[test]
    fn test_single_graph_component_check() {
        let input = r#"
            namespace N(16);
            pol commit a;
            (a - 1) * a = 0;
        "#;
        let analyzed = analyze_string::<GoldilocksField>(input);
        let result = single_graph_component_check(&analyzed);
        assert!(result.is_ok());
    }

    #[test]
    fn test_multiple_components() {
        let input = r#"
            namespace N(16);
            pol commit a;
            pol commit b;
            (a - 1) * a = 0;
        "#;
        let analyzed = analyze_string::<GoldilocksField>(input);
        let result = single_graph_component_check(&analyzed);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Graph is not a single component"));
    }

    #[test]
    fn test_sel_is_ignored() {
        let input = r#"
            namespace N(16);
            pol commit a;
            pol commit b;
            pol commit sel;
            sel * a = 0;
            sel * b = 1;
        "#;
        let analyzed = analyze_string::<GoldilocksField>(input);
        let result = single_graph_component_check(&analyzed);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Graph is not a single component"));
    }

    #[test]
    fn test_columns_connected_by_same_identity() {
        let input = r#"
            namespace N(16);
            pol commit a;
            pol commit b;
            a - b = 0;
        "#;
        let analyzed = analyze_string::<GoldilocksField>(input);
        let result = single_graph_component_check(&analyzed);
        assert!(result.is_ok());
    }
}

 
