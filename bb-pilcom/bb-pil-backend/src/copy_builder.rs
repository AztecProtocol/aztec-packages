use std::fmt::{Debug, Formatter, Result};

use crate::file_writer::BBFiles;
use crate::utils::{create_get_const_entities, create_get_nonconst_entities, snake_case},
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
        write!(f, "Copy {{ left: {:?}, right: {:?} }}", self.left, self.right)
    }
}

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

        // TODO: better name get arity?
        let num_id_columns = get_number_of_id_columns(&copy_pairs);

        println!("Number of id columns {num_columns}");

        Copies {
            copy_pairs,
            num_id_columns,
        }
    }
}

fn get_number_of_id_columns(copies: &Vec<Copy>) -> usize {
    // Get the maximum length of the copy vectors, left and right are asserted to be of same length
    copies.iter().map(|copy| copy.left.len()).max().unwrap_or(0)
}

pub fn get_inverses_from_copys(copies: &[Copy]) -> Vec<String> {
    copies.iter().map(|copy| copy.attribute.clone().unwrap_or_else(|| "copy_inverse".to_string())).collect()
}

fn get_copy_cols<F: FieldElement>(
    def: &SelectedExpressions<AlgebraicExpression<F>>,
) -> Vec<String> {
    let get_name = |expr: &AlgebraicExpression<F>| match expr {
        AlgebraicExpression::Reference(a_ref) => sanitize_name(&a_ref.name),
        _ => panic!("Expected reference"),
    };

    def.expressions.iter().map(get_name).collect_vec()
}

fn create_copies(bb_files: &BBFiles, project_name: &str, copies: &Vec<Copy>) {
    for copy in copies {
        // Copy settings define a log derivative version of the copy constraints that can be 
        // used with the existing log derivative library
        let copy_settings = create_copy_settings_file(copy);
        
        let folder = format!("{}/{}", bb_files.rel, &snake_case(project_name));
        let file_name = format!(
            "{}{}",
            permutation.attribute.clone().unwrap_or("NONAME".to_owned()),
            ".hpp".to_owned()
        );
        bb_files.write_file(&folder, &file_name, &perm_settings);
    }
}

fn create_relation_exporter(copy_name: &str) -> String {
    let settings_name = format!("{}_copy_settings", copy_name);
    let permutation_export = format!("template <typename FF_> using {copy_name}_relation = GenericCopyRelation<{settings_name}, FF_>;");
    let relation_export = format!("template <typename FF_> using {copy_name} = GenericCopy<{settings_name}, FF_>;");

    format!(
        "
    {permutation_export} 
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

    // TODO: catch this earlier??? dont make an option in the parser????? - same for lookup and permutation
    let copy_name = copy
        .attribute
        .clone()
        .expect("Inverse column name must be provided using attribute syntax");

    let lhs_cols = copy.left.clone();
    let rhs_cols = copy.right.clone();
    let id_cols = get_id_column_names(columns_per_set);

    // 0.                       The polynomial containing the inverse products -> taken from the attributes
    // 4.. + columns per set.   lhs cols
    // 4 + columns per set.. .  rhs cols
    // 4 + 2 * columns per set. id cols
    let mut copy_entities: Vec<String> = [
        copy_name.clone(),
    ]
    .to_vec();

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

        class {copy_name}_permutation_settings {{
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
    format!("
    template <typename AllEntities> static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in) {{
        return 1;
    }}")
}

pub fn get_id_column_names(number_of_cols: usize) -> Vec<String> {
    (0..number_of_cols).map(|i| format!("id_{}", i)).collect()
}