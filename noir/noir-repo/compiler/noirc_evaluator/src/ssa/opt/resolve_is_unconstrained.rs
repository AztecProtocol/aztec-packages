use crate::{
    errors::RuntimeError,
    ssa::{
        ir::{
            function::{Function, RuntimeType},
            instruction::{Instruction, Intrinsic},
            types::Type,
            value::Value,
        },
        ssa_gen::Ssa,
    },
};
use acvm::FieldElement;
use fxhash::FxHashSet as HashSet;

impl Ssa {
    /// An SSA pass to find any calls to `Intrinsic::IsUnconstrained` and replacing any uses of the result of the intrinsic
    /// with the resolved boolean value.
    /// Note that this pass must run after the pass that does runtime separation, since in SSA generation an ACIR function can end up targeting brillig.
    #[tracing::instrument(level = "trace", skip(self))]
    pub(crate) fn resolve_is_unconstrained(mut self) -> Result<Ssa, RuntimeError> {
        for func in self.functions.values_mut() {
            replace_is_unconstrained_result(func)?;
        }
        Ok(self)
    }
}

fn replace_is_unconstrained_result(func: &mut Function) -> Result<(), RuntimeError> {
    let mut is_unconstrained_calls = HashSet::default();
    // Collect all calls to is_unconstrained
    for block_id in func.reachable_blocks() {
        for &instruction_id in func.dfg[block_id].instructions() {
            let target_func = match &func.dfg[instruction_id] {
                Instruction::Call { func, .. } => *func,
                _ => continue,
            };

            if let Value::Intrinsic(Intrinsic::IsUnconstrained(is_assertion)) =
                &func.dfg[target_func]
            {
                is_unconstrained_calls.insert((instruction_id, *is_assertion));
            }
        }
    }

    for (instruction_id, is_assertion) in is_unconstrained_calls {
        let is_within_unconstrained = matches!(func.runtime(), RuntimeType::Brillig);

        if !is_within_unconstrained && is_assertion {
            let call_stack = func.dfg.get_call_stack(instruction_id);
            return Err(RuntimeError::OnlyWithinUnconstrained { call_stack });
        }

        let call_returns = func.dfg.instruction_results(instruction_id);
        let original_return_id = call_returns[0];

        // We replace the result with a fresh id. This will be unused, so the DIE pass will remove the leftover intrinsic call.
        func.dfg.replace_result(instruction_id, original_return_id);

        let is_within_unconstrained_id =
            func.dfg.make_constant(FieldElement::from(is_within_unconstrained), Type::bool());

        // Replace all uses of the original return value with the constant
        func.dfg.set_value_from_id(original_return_id, is_within_unconstrained_id);
    }
    Ok(())
}
