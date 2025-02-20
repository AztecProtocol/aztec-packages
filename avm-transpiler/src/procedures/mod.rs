use compiler::{compile, CompiledProcedure};
use msm::MSM_ASSEMBLY;
use parser::parse;

pub(crate) use compiler::SCRATCH_SPACE_START;

mod compiler;
mod msm;
mod parser;

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash)]
pub(crate) enum Procedure {
    MultiScalarMul,
}

impl Procedure {
    pub(crate) fn label_prefix(self) -> String {
        match self {
            Procedure::MultiScalarMul => "MSM_PROCEDURE_PREFIX".to_string(),
        }
    }

    pub(crate) fn entrypoint_label(self) -> String {
        format!("{}__{}", self.label_prefix(), "ENTRYPOINT")
    }
}

pub(crate) fn compile_procedure(procedure: Procedure) -> Result<CompiledProcedure, String> {
    let assembly = match procedure {
        Procedure::MultiScalarMul => MSM_ASSEMBLY,
    };
    let parsed = parse(assembly)?;
    compile(parsed, procedure)
}
