use acvm::acir::brillig::{
    BinaryIntOp, HeapValueType, MemoryAddress, Opcode as BrilligOpcode, ValueOrArray,
};

use super::{brillig_variable::BrilligVariable, BrilligContext, ReservedRegisters};

impl BrilligContext {
    /// Saves all of the registers that have been used up until this point.
    fn save_registers_of_vars(&mut self, vars: &[BrilligVariable]) -> Vec<MemoryAddress> {
        // Save all of the used registers at this point in memory
        // because the function call will/may overwrite them.
        //
        // Note that here it is important that the stack pointer register is at register 0,
        // as after the first register save we add to the pointer.
        let mut used_registers: Vec<_> =
            vars.iter().flat_map(|var| var.extract_registers()).collect();

        // Also dump the previous stack pointer
        used_registers.push(ReservedRegisters::previous_stack_pointer());
        for register in used_registers.iter() {
            self.store_instruction(ReservedRegisters::stack_pointer(), *register);
            // Add one to our stack pointer
            self.usize_op_in_place(ReservedRegisters::stack_pointer(), BinaryIntOp::Add, 1);
        }

        // Store the location of our registers in the previous stack pointer
        self.mov_instruction(
            ReservedRegisters::previous_stack_pointer(),
            ReservedRegisters::stack_pointer(),
        );
        used_registers
    }

    /// Loads all of the registers that have been save by save_all_used_registers.
    fn load_all_saved_registers(&mut self, used_registers: &[MemoryAddress]) {
        // Load all of the used registers that we saved.
        // We do all the reverse operations of save_all_used_registers.
        // Iterate our registers in reverse
        let iterator_register = self.allocate_register();
        self.mov_instruction(iterator_register, ReservedRegisters::previous_stack_pointer());

        for register in used_registers.iter().rev() {
            // Subtract one from our stack pointer
            self.usize_op_in_place(iterator_register, BinaryIntOp::Sub, 1);
            self.load_instruction(*register, iterator_register);
        }
    }

    // Used before a call instruction.
    // Save all the registers we have used to the stack.
    // Move argument values to the front of the register indices.
    pub(crate) fn pre_call_save_registers_prep_args(
        &mut self,
        arguments: &[MemoryAddress],
        variables_to_save: &[BrilligVariable],
    ) -> Vec<MemoryAddress> {
        // Save all the registers we have used to the stack.
        let saved_registers = self.save_registers_of_vars(variables_to_save);

        // Move argument values to the front of the registers
        //
        // This means that the arguments will be in the first `n` registers after
        // the number of reserved registers.
        let (sources, destinations): (Vec<_>, Vec<_>) =
            arguments.iter().enumerate().map(|(i, argument)| (*argument, self.register(i))).unzip();
        destinations
            .iter()
            .for_each(|destination| self.registers.ensure_register_is_allocated(*destination));
        self.mov_registers_to_registers_instruction(sources, destinations);
        saved_registers
    }

    // Used after a call instruction.
    // Move return values to the front of the register indices.
    // Load all the registers we have previous saved in save_registers_prep_args.
    pub(crate) fn post_call_prep_returns_load_registers(
        &mut self,
        result_registers: &[MemoryAddress],
        saved_registers: &[MemoryAddress],
    ) {
        // Allocate our result registers and write into them
        // We assume the return values of our call are held in 0..num results register indices
        let (sources, destinations): (Vec<_>, Vec<_>) = result_registers
            .iter()
            .enumerate()
            .map(|(i, result_register)| (self.register(i), *result_register))
            .unzip();
        sources.iter().for_each(|source| self.registers.ensure_register_is_allocated(*source));
        self.mov_registers_to_registers_instruction(sources, destinations);

        // Restore all the same registers we have, in exact reverse order.
        // Note that we have allocated some registers above, which we will not be handling here,
        // only restoring registers that were used prior to the call finishing.
        // After the call instruction, the stack frame pointer should be back to where we left off,
        // so we do our instructions in reverse order.
        self.load_all_saved_registers(saved_registers);
    }

    /// Processes a foreign call instruction.
    ///
    /// Note: the function being called is external and will
    /// not be linked during brillig generation.
    pub(crate) fn foreign_call_instruction(
        &mut self,
        func_name: String,
        inputs: &[ValueOrArray],
        input_value_types: &[HeapValueType],
        outputs: &[ValueOrArray],
        output_value_types: &[HeapValueType],
    ) {
        assert!(inputs.len() == input_value_types.len());
        assert!(outputs.len() == output_value_types.len());
        self.debug_show.foreign_call_instruction(func_name.clone(), inputs, outputs);
        let opcode = BrilligOpcode::ForeignCall {
            function: func_name,
            destinations: outputs.to_vec(),
            destination_value_types: output_value_types.to_vec(),
            inputs: inputs.to_vec(),
            input_value_types: input_value_types.to_vec(),
        };
        self.push_opcode(opcode);
    }

    /// Adds a unresolved external `Call` instruction to the bytecode.
    /// This calls into another function compiled into this brillig artifact.
    pub(crate) fn add_external_call_instruction<T: ToString>(&mut self, func_label: T) {
        self.debug_show.add_external_call_instruction(func_label.to_string());
        self.obj.add_unresolved_external_call(
            BrilligOpcode::Call { location: 0 },
            func_label.to_string(),
        );
    }
}
