use acvm::acir::brillig::{BinaryIntOp, MemoryAddress, Opcode as BrilligOpcode};

use super::{
    artifact::UnresolvedJumpLocation, brillig_variable::SingleAddrVariable, BrilligContext,
    ReservedRegisters,
};

impl BrilligContext {
    /// Adds a unresolved `Jump` instruction to the bytecode.
    pub(crate) fn jump_instruction<T: ToString>(&mut self, target_label: T) {
        self.debug_show.jump_instruction(target_label.to_string());
        self.add_unresolved_jump(BrilligOpcode::Jump { location: 0 }, target_label.to_string());
    }

    /// Adds a unresolved `JumpIf` instruction to the bytecode.
    pub(crate) fn jump_if_instruction<T: ToString>(
        &mut self,
        condition: MemoryAddress,
        target_label: T,
    ) {
        self.debug_show.jump_if_instruction(condition, target_label.to_string());
        self.add_unresolved_jump(
            BrilligOpcode::JumpIf { condition, location: 0 },
            target_label.to_string(),
        );
    }

    /// Emits brillig bytecode to jump to a trap condition if `condition`
    /// is false.
    pub(crate) fn constrain_instruction(
        &mut self,
        condition: SingleAddrVariable,
        assert_message: Option<String>,
    ) {
        assert!(condition.bit_size == 1);
        self.debug_show.constrain_instruction(condition.address);
        let (next_section, next_label) = self.reserve_next_section_label();
        self.add_unresolved_jump(
            BrilligOpcode::JumpIf { condition: condition.address, location: 0 },
            next_label,
        );
        self.push_opcode(BrilligOpcode::Trap);
        if let Some(assert_message) = assert_message {
            self.obj.add_assert_message_to_last_opcode(assert_message);
        }
        self.enter_section(next_section);
    }

    /// Processes a return instruction.
    ///
    /// For Brillig, the return is implicit, since there is no explicit return instruction.
    /// The caller will take `N` values from the Register starting at register index 0.
    /// `N` indicates the number of return values expected.
    ///
    /// Brillig does not have an explicit return instruction, so this
    /// method will move all register values to the first `N` values in
    /// the VM.
    pub(crate) fn codegen_return(&mut self, return_registers: &[MemoryAddress]) {
        self.debug_show.return_instruction(return_registers);
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
        self.mov_registers_to_registers_instruction(sources, destinations);
        self.stop_instruction();
    }

    /// This codegen will issue a loop that will iterate iteration_count times
    /// The body of the loop should be issued by the caller in the on_iteration closure.
    pub(crate) fn codegen_loop<F>(&mut self, iteration_count: MemoryAddress, on_iteration: F)
    where
        F: FnOnce(&mut BrilligContext, SingleAddrVariable),
    {
        let iterator_register = self.make_usize_constant_instruction(0_u128.into());

        let (loop_section, loop_label) = self.reserve_next_section_label();
        self.enter_section(loop_section);

        // Loop body

        // Check if iterator < iteration_count
        let iterator_less_than_iterations =
            SingleAddrVariable { address: self.allocate_register(), bit_size: 1 };

        self.memory_op_instruction(
            iterator_register.address,
            iteration_count,
            iterator_less_than_iterations.address,
            BinaryIntOp::LessThan,
        );

        let (exit_loop_section, exit_loop_label) = self.reserve_next_section_label();

        self.not_instruction(iterator_less_than_iterations, iterator_less_than_iterations);

        self.jump_if_instruction(iterator_less_than_iterations.address, exit_loop_label);

        // Call the on iteration function
        on_iteration(self, iterator_register);

        // Increment the iterator register
        self.usize_op_in_place_instruction(iterator_register.address, BinaryIntOp::Add, 1);

        self.jump_instruction(loop_label);

        // Exit the loop
        self.enter_section(exit_loop_section);

        // Deallocate our temporary registers
        self.deallocate_single_addr(iterator_less_than_iterations);
        self.deallocate_single_addr(iterator_register);
    }

    /// This codegen will issue an if-then branch that will check if the condition is true
    /// and if so, perform the instructions given in `f(self, true)` and otherwise perform the
    /// instructions given in `f(self, false)`. A boolean is passed instead of two separate
    /// functions to allow the given function to mutably alias its environment.
    pub(crate) fn codegen_branch(
        &mut self,
        condition: MemoryAddress,
        mut f: impl FnMut(&mut BrilligContext, bool),
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

    /// This codegen issues a branch that jumps over the code generated by the given function if the condition is truthy
    pub(crate) fn codegen_if_not(
        &mut self,
        condition: MemoryAddress,
        f: impl FnOnce(&mut BrilligContext),
    ) {
        let (end_section, end_label) = self.reserve_next_section_label();

        self.jump_if_instruction(condition, end_label.clone());

        f(self);

        self.enter_section(end_section);
    }

    /// Adds a unresolved `Jump` to the bytecode.
    fn add_unresolved_jump(
        &mut self,
        jmp_instruction: BrilligOpcode,
        destination: UnresolvedJumpLocation,
    ) {
        self.obj.add_unresolved_jump(jmp_instruction, destination);
    }

    /// Adds a label to the next opcode
    pub(crate) fn enter_context<T: ToString>(&mut self, label: T) {
        self.debug_show.enter_context(label.to_string());
        self.context_label = label.to_string();
        self.section_label = 0;
        // Add a context label to the next opcode
        self.obj.add_label_at_position(label.to_string(), self.obj.index_of_next_opcode());
        // Add a section label to the next opcode
        self.obj
            .add_label_at_position(self.current_section_label(), self.obj.index_of_next_opcode());
    }

    /// Enter the given section
    fn enter_section(&mut self, section: usize) {
        self.section_label = section;
        self.obj
            .add_label_at_position(self.current_section_label(), self.obj.index_of_next_opcode());
    }

    /// Create, reserve, and return a new section label.
    fn reserve_next_section_label(&mut self) -> (usize, String) {
        let section = self.next_section;
        self.next_section += 1;
        (section, self.compute_section_label(section))
    }

    /// Internal function used to compute the section labels
    fn compute_section_label(&self, section: usize) -> String {
        format!("{}-{}", self.context_label, section)
    }

    /// Returns the current section label
    fn current_section_label(&self) -> String {
        self.compute_section_label(self.section_label)
    }

    /// Emits a stop instruction
    pub(crate) fn stop_instruction(&mut self) {
        self.debug_show.stop_instruction();
        self.push_opcode(BrilligOpcode::Stop { return_data_offset: 0, return_data_size: 0 });
    }
}
