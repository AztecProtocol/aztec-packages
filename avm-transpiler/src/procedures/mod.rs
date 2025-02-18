use compiler::{compile, CompiledProcedure};
use msm::MSM_ASSEMBLY;
use parser::parse;

mod compiler;
mod msm;
mod parser;

pub(crate) enum Procedure {
    MSM,
}

pub(crate) fn add_procedure(procedure: Procedure) -> Result<CompiledProcedure, String> {
    match procedure {
        Procedure::MSM => {
            let parsed = parse(MSM_ASSEMBLY)?;
            compile(parsed)
        }
    }
}
