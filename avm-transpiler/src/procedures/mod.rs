use compiler::{compile, CompiledProcedure};
use msm::MSM_ASSEMBLY;
use parser::parse;

pub(crate) use compiler::Label;

mod compiler;
mod msm;
mod parser;

pub(crate) enum Procedure {
    MSM,
}

impl Procedure {
    fn label_prefix(self) -> String {
        match self {
            Procedure::MSM => "MSM_PROCEDURE_PREFIX".to_string(),
        }
    }
}

pub(crate) fn add_procedure(procedure: Procedure) -> Result<CompiledProcedure, String> {
    let assembly = match procedure {
        Procedure::MSM => MSM_ASSEMBLY,
    };
    let parsed = parse(assembly)?;
    compile(parsed, procedure.label_prefix())
}
