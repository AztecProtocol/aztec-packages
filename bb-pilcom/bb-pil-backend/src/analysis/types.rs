use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize)]
pub struct AnalysisOutput {
    pub schema_version: String,
    pub metadata: PilMetadata,
    pub namespaces: BTreeMap<String, NamespaceAnalysis>,
    pub cross_namespace_connections: Vec<CrossNamespaceConnection>,
    pub dependency_graph: DependencyGraph,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Serialize)]
pub struct PilMetadata {
    pub field_modulus: String,
    pub total_columns: ColumnCounts,
    pub total_constraints: usize,
    pub total_lookups: usize,
    pub total_permutations: usize,
}

#[derive(Serialize)]
pub struct ColumnCounts {
    pub committed: usize,
    pub constant: usize,
    pub intermediate: usize,
}

#[derive(Serialize)]
pub struct NamespaceAnalysis {
    pub source_files: Vec<String>,
    pub columns: Vec<ColumnInfo>,
    pub constraints: Vec<ConstraintInfo>,
    pub selectors: Vec<SelectorInfo>,
    pub block_structure: Option<BlockInfo>,
    pub complexity: NamespaceComplexity,
}

#[derive(Serialize, Clone)]
pub struct ColumnInfo {
    pub name: String,
    pub kind: String,
    pub poly_id: u64,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub array_size: Option<u64>,
    pub is_boolean: bool,
    /// How boolean status was determined:
    /// - "explicit": has a `x * (1 - x) = 0` constraint
    /// - "derived": intermediate derived from booleans (product, 1-x)
    /// - null: not boolean
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boolean_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boolean_constraint_source: Option<String>,
    pub is_shifted: bool,
    pub referenced_by_identities: Vec<u64>,
    pub in_lookups: Vec<u64>,
    pub in_permutations: Vec<u64>,
}

#[derive(Serialize, Clone)]
pub struct ConstraintInfo {
    pub identity_id: u64,
    pub kind: String,
    pub classifications: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub source: String,
    pub expression_raw: String,
    pub expression_inlined: String,
    pub columns_used: Vec<String>,
    pub degree: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gating_selector: Option<String>,
    /// For lookup/permutation/connect: the left (source) selector column.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_selector: Option<String>,
    /// For lookup/permutation/connect: the right (dest) selector column.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_selector: Option<String>,
}

#[derive(Serialize)]
pub struct CrossNamespaceConnection {
    pub identity_id: u64,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub source: String,
    pub source_namespace: String,
    pub dest_namespace: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dest_selector: Option<String>,
    pub column_mapping: Vec<ColumnMapping>,
}

#[derive(Serialize)]
pub struct ColumnMapping {
    pub source_expr: String,
    pub dest_expr: String,
    pub source_columns: Vec<String>,
    pub dest_columns: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct SelectorInfo {
    pub name: String,
    /// How the selector's boolean nature was established:
    /// - "explicit": has a `x * (1 - x) = 0` constraint
    /// - "derived": intermediate derived from booleans (product, 1-x)
    /// - "assumed": gates constraints but no boolean proof found locally
    ///   (may be boolean via lookup/permutation from another namespace)
    pub boolean_source: String,
    pub is_composite: bool,
    pub composite_of: Vec<String>,
    pub gates_identities: Vec<u64>,
    pub in_lookups_as_selector: Vec<u64>,
}

#[derive(Serialize, Clone)]
pub struct BlockInfo {
    pub counter_columns: Vec<String>,
    pub latch_conditions: Vec<String>,
    pub cross_row_state_columns: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct NamespaceComplexity {
    pub total_constraints: usize,
    pub total_columns: usize,
    pub max_degree: u64,
    pub avg_degree: f64,
}

#[derive(Serialize)]
pub struct DependencyGraph {
    pub edges: Vec<DependencyEdge>,
}

#[derive(Serialize)]
pub struct DependencyEdge {
    pub from: String,
    pub to: String,
    pub via_identity_id: u64,
    pub edge_type: String,
}

#[derive(Serialize)]
pub struct Diagnostic {
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<String>,
}
