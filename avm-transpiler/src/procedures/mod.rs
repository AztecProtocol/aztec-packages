use compiler::{CompiledProcedure, compile};
use msm::MSM_ASSEMBLY;
use parser::parse;
use u128_mul_div::U128_MUL_DIV_ASSEMBLY;
use u128_wide_mul::U128_WIDE_MUL_ASSEMBLY;

pub(crate) use compiler::scratch_space_range;
pub(crate) use parser::Label;

mod compiler;
mod msm;
mod parser;
mod u128_mul_div;
mod u128_wide_mul;

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash)]
pub(crate) enum Procedure {
    MultiScalarMul,
    U128WideMul,
    U128MulDiv,
}

pub(crate) fn compile_procedure(procedure: Procedure) -> Result<CompiledProcedure, String> {
    let assembly = match procedure {
        Procedure::MultiScalarMul => MSM_ASSEMBLY,
        Procedure::U128WideMul => U128_WIDE_MUL_ASSEMBLY,
        Procedure::U128MulDiv => U128_MUL_DIV_ASSEMBLY,
    };
    let parsed = parse(assembly)?;
    compile(parsed)
}
