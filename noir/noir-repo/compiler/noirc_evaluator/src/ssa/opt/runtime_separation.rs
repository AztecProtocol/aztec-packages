use crate::ssa::{
    ir::{
        function::{Function, FunctionId, RuntimeType},
        instruction::Instruction,
        value::{Value, ValueId},
    },
    ssa_gen::Ssa,
};
use fxhash::{FxHashMap as HashMap, FxHashSet as HashSet};

impl Ssa {
    #[tracing::instrument(level = "trace", skip(self))]
    pub(crate) fn separate_runtime(mut self) -> Self {
        RuntimeSeparatorContext::separate_runtime(&mut self);

        self
    }
}

fn called_functions_values(func: &Function) -> HashSet<ValueId> {
    let mut called_function_ids = HashSet::default();
    for block_id in func.reachable_blocks() {
        for instruction_id in func.dfg[block_id].instructions() {
            let Instruction::Call { func: called_value_id, .. } = &func.dfg[*instruction_id] else {
                continue;
            };

            if let Value::Function(_) = func.dfg[*called_value_id] {
                called_function_ids.insert(*called_value_id);
            }
        }
    }

    called_function_ids
}

fn called_functions(func: &Function) -> HashSet<FunctionId> {
    called_functions_values(func)
        .into_iter()
        .map(|value_id| {
            let Value::Function(func_id) = func.dfg[value_id] else {
                unreachable!("Value should be a function")
            };
            func_id
        })
        .collect()
}

#[derive(Debug, Default)]
struct RuntimeSeparatorContext {
    acir_functions_called_from_brillig: HashSet<FunctionId>,
    processed_functions: HashSet<(/* within_brillig */ bool, FunctionId)>,
    mapped_functions: HashMap<FunctionId, FunctionId>,
}

impl RuntimeSeparatorContext {
    fn separate_runtime(ssa: &mut Ssa) {
        let mut runtime_separator = RuntimeSeparatorContext::default();

        runtime_separator.collect_acir_functions_called_from_brillig(ssa, ssa.main_id, false);
        runtime_separator.processed_functions = HashSet::default();

        runtime_separator.convert_acir_functions_called_from_brillig_to_brillig(ssa);
        runtime_separator.replace_calls_to_mapped_functions(ssa, ssa.main_id, false);
    }

    fn collect_acir_functions_called_from_brillig(
        &mut self,
        ssa: &Ssa,
        current_func_id: FunctionId,
        mut within_brillig: bool,
    ) {
        if self.processed_functions.contains(&(within_brillig, current_func_id)) {
            return;
        }
        self.processed_functions.insert((within_brillig, current_func_id));

        let func = ssa.functions.get(&current_func_id).expect("Function should exist in SSA");
        if func.runtime() == RuntimeType::Brillig {
            within_brillig = true;
        }

        let called_functions = called_functions(func);

        if within_brillig {
            for called_func_id in called_functions.iter() {
                let called_func =
                    ssa.functions.get(called_func_id).expect("Function should exist in SSA");
                if matches!(called_func.runtime(), RuntimeType::Acir(_)) {
                    self.acir_functions_called_from_brillig.insert(*called_func_id);
                }
            }
        }

        for called_func_id in called_functions.into_iter() {
            self.collect_acir_functions_called_from_brillig(ssa, called_func_id, within_brillig);
        }
    }

    fn convert_acir_functions_called_from_brillig_to_brillig(&mut self, ssa: &mut Ssa) {
        for acir_func_id in self.acir_functions_called_from_brillig.iter() {
            let cloned_id = ssa.clone_fn(*acir_func_id);
            let new_func =
                ssa.functions.get_mut(&cloned_id).expect("Cloned function should exist in SSA");
            new_func.set_runtime(RuntimeType::Brillig);
            self.mapped_functions.insert(*acir_func_id, cloned_id);
        }
    }

    fn replace_calls_to_mapped_functions(
        &mut self,
        ssa: &mut Ssa,
        current_func_id: FunctionId,
        mut within_brillig: bool,
    ) {
        if self.processed_functions.contains(&(within_brillig, current_func_id)) {
            return;
        }
        self.processed_functions.insert((within_brillig, current_func_id));

        let func = ssa.functions.get_mut(&current_func_id).expect("Function should exist in SSA");
        if func.runtime() == RuntimeType::Brillig {
            within_brillig = true;
        }

        let called_functions_values = called_functions_values(func);

        // If we are within brillig, swap the called functions with the mapped functions
        if within_brillig {
            for called_func_value_id in called_functions_values.iter() {
                let Value::Function(called_func_id) = &func.dfg[*called_func_value_id] else {
                    unreachable!("Value should be a function")
                };
                if let Some(mapped_func_id) = self.mapped_functions.get(called_func_id) {
                    let new_target_value = Value::Function(*mapped_func_id);
                    let mapped_value_id = func.dfg.make_value(new_target_value);
                    func.dfg.set_value_from_id(*called_func_value_id, mapped_value_id);
                }
            }
        }

        // Get the called functions again after the replacements
        let called_functions = called_functions(func);
        for called_func_id in called_functions.into_iter() {
            self.replace_calls_to_mapped_functions(ssa, called_func_id, within_brillig);
        }
    }
}
