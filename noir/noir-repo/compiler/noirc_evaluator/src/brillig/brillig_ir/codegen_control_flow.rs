use acvm::{
    acir::brillig::{HeapArray, MemoryAddress},
    AcirField,
};

use super::{
    artifact::BrilligParameter,
    brillig_variable::{BrilligVariable, SingleAddrVariable},
    debug_show::DebugToString,
    BrilligBinaryOp, BrilligContext, ReservedRegisters,
};

impl<F: AcirField + DebugToString> BrilligContext<F> {
    /// Codegens a return from the current function.
    ///
    /// For Brillig, the return is implicit, since there is no explicit return instruction.
    /// The caller will take `N` values from the Register starting at register index 0.
    /// `N` indicates the number of return values expected.
    ///
    /// Brillig does not have an explicit return instruction, so this
    /// method will move all register values to the first `N` values in
    /// the VM.
    pub(crate) fn codegen_return(&mut self, return_registers: &[MemoryAddress]) {
        let mut sources = Vec::with_capacity(return_registers.len());
        let mut destinations = Vec::with_capacity(return_registers.len());

        for (destination_index, return_register) in return_registers.iter().enumerate() {
            // In case we have fewer return registers than indices to write to, ensure we've allocated this register
            let destination_register = ReservedRegisters::user_register_index(destination_index);
            self.registers.ensure_register_is_allocated(destination_register);
            sources.push(*return_register);
            destinations.push(destination_register);
        }
        destinations
            .iter()
            .for_each(|destination| self.registers.ensure_register_is_allocated(*destination));
        self.codegen_mov_registers_to_registers(sources, destinations);
        self.stop_instruction();
    }

    /// This codegen will issue a loop for (let iterator_register = loop_start; i < loop_bound; i += step)
    /// The body of the loop should be issued by the caller in the on_iteration closure.
    pub(crate) fn codegen_for_loop(
        &mut self,
        loop_start: Option<MemoryAddress>, // Defaults to zero
        loop_bound: MemoryAddress,
        step: Option<MemoryAddress>, // Defaults to 1
        on_iteration: impl FnOnce(&mut BrilligContext<F>, SingleAddrVariable),
    ) {
        let iterator_register = if let Some(loop_start) = loop_start {
            let iterator_register = SingleAddrVariable::new_usize(self.allocate_register());
            self.mov_instruction(iterator_register.address, loop_start);
            iterator_register
        } else {
            self.make_usize_constant_instruction(0_usize.into())
        };

        let step_register = if let Some(step) = step {
            step
        } else {
            self.make_usize_constant_instruction(1_usize.into()).address
        };

        let (loop_section, loop_label) = self.reserve_next_section_label();
        self.enter_section(loop_section);

        // Loop body

        // Check if iterator < loop_bound
        let iterator_less_than_iterations =
            SingleAddrVariable { address: self.allocate_register(), bit_size: 1 };

        self.memory_op_instruction(
            iterator_register.address,
            loop_bound,
            iterator_less_than_iterations.address,
            BrilligBinaryOp::LessThan,
        );

        let (exit_loop_section, exit_loop_label) = self.reserve_next_section_label();

        self.not_instruction(iterator_less_than_iterations, iterator_less_than_iterations);

        self.jump_if_instruction(iterator_less_than_iterations.address, exit_loop_label);

        // Call the on iteration function
        on_iteration(self, iterator_register);

        // Add step to the iterator register
        self.memory_op_instruction(
            iterator_register.address,
            step_register,
            iterator_register.address,
            BrilligBinaryOp::Add,
        );

        self.jump_instruction(loop_label);

        // Exit the loop
        self.enter_section(exit_loop_section);

        // Deallocate our temporary registers
        self.deallocate_single_addr(iterator_less_than_iterations);
        self.deallocate_single_addr(iterator_register);
        // Only deallocate step if we allocated it
        if step.is_none() {
            self.deallocate_register(step_register);
        }
    }

    /// This codegen will issue a loop that will iterate from 0 to iteration_count
    /// The body of the loop should be issued by the caller in the on_iteration closure.
    pub(crate) fn codegen_loop(
        &mut self,
        iteration_count: MemoryAddress,
        on_iteration: impl FnOnce(&mut BrilligContext<F>, SingleAddrVariable),
    ) {
        self.codegen_for_loop(None, iteration_count, None, on_iteration);
    }

    /// This codegen will issue an if-then branch that will check if the condition is true
    /// and if so, perform the instructions given in `f(self, true)` and otherwise perform the
    /// instructions given in `f(self, false)`. A boolean is passed instead of two separate
    /// functions to allow the given function to mutably alias its environment.
    pub(crate) fn codegen_branch(
        &mut self,
        condition: MemoryAddress,
        mut f: impl FnMut(&mut BrilligContext<F>, bool),
    ) {
        // Reserve 3 sections
        let (then_section, then_label) = self.reserve_next_section_label();
        let (otherwise_section, otherwise_label) = self.reserve_next_section_label();
        let (end_section, end_label) = self.reserve_next_section_label();

        self.jump_if_instruction(condition, then_label.clone());
        self.jump_instruction(otherwise_label.clone());

        self.enter_section(then_section);
        f(self, true);
        self.jump_instruction(end_label.clone());

        self.enter_section(otherwise_section);
        f(self, false);
        self.jump_instruction(end_label.clone());

        self.enter_section(end_section);
    }

    /// This codegen issues a branch that jumps over the code generated by the given function if the condition is false
    pub(crate) fn codegen_if(
        &mut self,
        condition: MemoryAddress,
        f: impl FnOnce(&mut BrilligContext<F>),
    ) {
        let (end_section, end_label) = self.reserve_next_section_label();
        let (then_section, then_label) = self.reserve_next_section_label();

        self.jump_if_instruction(condition, then_label.clone());
        self.jump_instruction(end_label.clone());

        self.enter_section(then_section);
        f(self);

        self.enter_section(end_section);
    }

    /// This codegen issues a branch that jumps over the code generated by the given function if the condition is truthy
    pub(crate) fn codegen_if_not(
        &mut self,
        condition: MemoryAddress,
        f: impl FnOnce(&mut BrilligContext<F>),
    ) {
        let (end_section, end_label) = self.reserve_next_section_label();

        self.jump_if_instruction(condition, end_label.clone());

        f(self);

        self.enter_section(end_section);
    }

    /// Emits brillig bytecode to jump to a trap condition if `condition`
    /// is false. The trap will include the given message as revert data.
    pub(crate) fn codegen_constrain_with_revert_data(
        &mut self,
        condition: SingleAddrVariable,
        revert_data_items: Vec<BrilligVariable>,
        revert_data_types: Vec<BrilligParameter>,
        error_selector: u64,
    ) {
        assert!(condition.bit_size == 1);

        self.codegen_if_not(condition.address, |ctx| {
            let revert_data = HeapArray {
                pointer: ctx.allocate_register(),
                // + 1 due to the revert data id being the first item returned
                size: Self::flattened_tuple_size(&revert_data_types) + 1,
            };
            ctx.codegen_allocate_fixed_length_array(revert_data.pointer, revert_data.size);

            let current_revert_data_pointer = ctx.allocate_register();
            ctx.mov_instruction(current_revert_data_pointer, revert_data.pointer);
            let revert_data_id = ctx.make_constant_instruction((error_selector as u128).into(), 64);
            ctx.store_instruction(current_revert_data_pointer, revert_data_id.address);

            ctx.codegen_usize_op_in_place(current_revert_data_pointer, BrilligBinaryOp::Add, 1);
            for (revert_variable, revert_param) in
                revert_data_items.into_iter().zip(revert_data_types.into_iter())
            {
                let flattened_size = Self::flattened_size(&revert_param);
                match revert_param {
                    BrilligParameter::SingleAddr(_) => {
                        ctx.store_instruction(
                            current_revert_data_pointer,
                            revert_variable.extract_single_addr().address,
                        );
                    }
                    BrilligParameter::Array(item_type, item_count) => {
                        let variable_pointer = revert_variable.extract_array().pointer;

                        ctx.flatten_array(
                            &item_type,
                            item_count,
                            current_revert_data_pointer,
                            variable_pointer,
                        );
                    }
                    BrilligParameter::Slice(_, _) => {
                        unimplemented!("Slices are not supported as revert data")
                    }
                }
                ctx.codegen_usize_op_in_place(
                    current_revert_data_pointer,
                    BrilligBinaryOp::Add,
                    flattened_size,
                );
            }
            ctx.trap_instruction(revert_data);
            ctx.deallocate_register(revert_data.pointer);
            ctx.deallocate_register(current_revert_data_pointer);
            ctx.deallocate_single_addr(revert_data_id);
        });
    }

    /// Emits brillig bytecode to jump to a trap condition if `condition`
    /// is false.
    pub(crate) fn codegen_constrain(
        &mut self,
        condition: SingleAddrVariable,
        assert_message: Option<String>,
    ) {
        assert!(condition.bit_size == 1);

        self.codegen_if_not(condition.address, |ctx| {
            ctx.trap_instruction(HeapArray::default());
            if let Some(assert_message) = assert_message {
                ctx.obj.add_assert_message_to_last_opcode(assert_message);
            }
        });
    }
}
