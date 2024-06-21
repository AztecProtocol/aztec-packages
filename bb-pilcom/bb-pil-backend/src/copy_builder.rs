use std::fmt::{Debug, Formatter};

use crate::file_writer::BBFiles;
use crate::utils::{create_get_const_entities, create_get_nonconst_entities, snake_case};
use crate::utils::sanitize_name;
use itertools::Itertools;
use powdr_ast::{
    analyzed::{AlgebraicExpression, Analyzed, Identity, IdentityKind},
    parsed::SelectedExpressions,
};
use powdr_number::FieldElement;

pub struct Copies {
    pub copy_pairs: Vec<Copy>,
    pub num_id_columns: usize,
}

pub struct Copy {
    // The name of the inverses column
    attribute: Option<String>,
    // Columns involved in the lhs of the copy relation
    left: Vec<String>,
    // Columns involved in the rhs of the copy relation
    right: Vec<String>
}

impl Debug for Copy {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "Copy {:?} {{ left: {:?}, right: {:?} }}", self.attribute, self.left, self.right)
    }
}

/// Copy Builder
/// 
/// Copy builder will create a copy_settings file for each copy relation required
/// Barretenberg includes a `generic_copy_relation` that can construct copy's out of these
/// generic relations
pub trait CopyBuilder {
    fn create_copy_files<F: FieldElement>(
        &self,
        name: &str,
        analyzed: &Analyzed<F>,
    ) -> Copies;
}

impl CopyBuilder for BBFiles {
    fn create_copy_files<F: FieldElement>(
        &self,
        name: &str,
        analyzed: &Analyzed<F>,
    ) -> Copies {
        let copies: Vec<&Identity<AlgebraicExpression<F>>> = analyzed.identities.iter().filter(|identity| matches!(identity.kind, IdentityKind::Connect)).collect();

        let copy_pairs: Vec<Copy> = copies.iter().map(|copy| { 
            let pair = Copy {
                attribute: copy.attribute.clone().map(|att| att.to_lowercase()),
                left: get_copy_cols(&copy.left),
                right: get_copy_cols(&copy.right),
            };

            assert_eq!(&pair.left.len(), &pair.right.len());
            pair
        }).collect();

        // Airity 
        let num_id_columns = get_copy_max_airity(&copy_pairs);

        // Create the copy settings files from each copy pair
        create_copies(self, name, &copy_pairs);

        Copies {
            copy_pairs,
            num_id_columns,
        }
    }
}

/// Get Copy Max Arity
/// 
/// We are required to commit to "pre-commit" to the number of id columns that will be used as the 
/// disjoint subgroups for our copy constraint relations 
/// 
/// These groups can be shared across copy constraints, however we need to accomodate for a maximum size
fn get_copy_max_airity(copies: &Vec<Copy>) -> usize {
    copies.iter().map(|copy| copy.left.len()).max().unwrap_or(0)
}

/// Get Inverses from Copies
/// 
/// We use the provided attribute name as the name of the inverse column for our copy constraints
pub fn get_inverses_from_copies(copies: &Copies) -> Vec<String> {
    copies.copy_pairs.iter().map(|copy| copy.attribute.clone().unwrap_or_else(|| "copy_inverse".to_string())).collect()
}

/// Get Copy Cols
/// 
/// Returns the name of the columns involved in a copy constraint definition
fn get_copy_cols<F: FieldElement>(
    def: &SelectedExpressions<AlgebraicExpression<F>>,
) -> Vec<String> {
    let get_name = |expr: &AlgebraicExpression<F>| match expr {
        AlgebraicExpression::Reference(a_ref) => sanitize_name(&a_ref.name),
        _ => panic!("Expected reference"),
    };

    def.expressions.iter().map(get_name).collect_vec()
}

/// Create Copies
/// 
/// Create the copy settings file which can be fed to the `generic copy relation`
/// This file will be included as a relation in the flavor AND in the circuit checker
fn create_copies(bb_files: &BBFiles, project_name: &str, copies: &Vec<Copy>) {
    for copy in copies {
        // Copy settings define a log derivative version of the copy constraints that can be 
        // used with the existing log derivative library
        let copy_settings = create_copy_settings_file(copy);
        
        let folder = format!("{}/{}", bb_files.rel, &snake_case(project_name));
        let file_name = format!(
            "{}{}",
            copy.attribute.clone().unwrap_or("NONAME".to_owned()),
            ".hpp".to_owned()
        );
        bb_files.write_file(&folder, &file_name, &copy_settings);
    }
}

fn create_relation_exporter(copy_name: &str) -> String {
    let settings_name = format!("{}_copy_settings", copy_name);
    let copy_export = format!("template <typename FF_> using {copy_name}_relation = GenericCopyRelation<{settings_name}, FF_>;");
    let relation_export = format!("template <typename FF_> using {copy_name} = GenericCopy<{settings_name}, FF_>;");

    format!(
        "
    {copy_export} 
    {relation_export} 
    "
    )
}

fn copy_settings_includes() -> &'static str {
    r#"
    #pragma once

    #include "barretenberg/relations/generic_copy_relation/generic_copy_relation.hpp"

    #include <cstddef>
    #include <tuple> 
    "#
}

fn create_copy_settings_file(copy: &Copy) -> String {
    log::trace!("Copy: {:?}", copy);
    let columns_per_set = copy.left.len();

    let copy_name = copy
        .attribute
        .clone()
        .expect("Inverse column name must be provided using attribute syntax");

    let lhs_cols = copy.left.clone();
    let rhs_cols = copy.right.clone();
    let id_cols = get_id_column_names(columns_per_set);

    // 0.                       The polynomial containing the inverse products -> taken from the attributes
    // 0..cols_per_set                       .......... value cols
    // cols_per_set..2*cols_per_set columns  .......... sigma cols
    // 2*cols_per_set..3*cols_per_set        .......... id cols
    let mut copy_entities: Vec<String> = vec![copy_name.clone()];
    copy_entities.extend(lhs_cols);
    copy_entities.extend(rhs_cols);
    copy_entities.extend(id_cols);

    let copy_settings_includes = copy_settings_includes();

    let inverse_computed_at = create_inverse_computed_at();
    let const_entities = create_get_const_entities(&copy_entities);
    let nonconst_entities = create_get_nonconst_entities(&copy_entities);
    let relation_exporter = create_relation_exporter(&copy_name);

    format!(
        "
        {copy_settings_includes}

        namespace bb {{

        class {copy_name}_copy_settings {{
            public:
                  constexpr static size_t COLUMNS_PER_SET = {columns_per_set};
              
                  {inverse_computed_at}
              
                  {const_entities}
              
                  {nonconst_entities}
        }};

        {relation_exporter}
    }}
        "
    )
}

fn create_inverse_computed_at() -> String {
    "
    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row([[maybe_unused]] const AllEntities& in) {
        return 1;
    }".to_string()
}

pub fn get_id_column_names(number_of_cols: usize) -> Vec<String> {
    (0..number_of_cols).map(|i| format!("id_{}", i)).collect()
}