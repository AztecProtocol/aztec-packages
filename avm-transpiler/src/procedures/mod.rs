use compiler::{CompiledProcedure, compile};
use msm::MSM_ASSEMBLY;
use parser::parse;

pub(crate) use compiler::SCRATCH_SPACE_START;
pub(crate) use parser::Label;

mod compiler;
mod msm;
mod parser;

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash)]
pub(crate) enum Procedure {
    MultiScalarMul,
}

pub(crate) fn compile_procedure(procedure: Procedure) -> Result<CompiledProcedure, String> {
    let assembly = match procedure {
        Procedure::MultiScalarMul => MSM_ASSEMBLY,
    };
    let parsed = parse(assembly)?;
    compile(parsed)
}
