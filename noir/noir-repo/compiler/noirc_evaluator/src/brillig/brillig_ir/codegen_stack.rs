use acvm::acir::brillig::{MemoryAddress, Opcode as BrilligOpcode, Value};

use super::{
    brillig_variable::SingleAddrVariable, registers::BrilligRegistersContext, BrilligContext,
    ReservedRegisters,
};

impl BrilligContext {
    /// Returns the i'th register after the reserved ones
    pub(crate) fn register(&self, i: usize) -> MemoryAddress {
        MemoryAddress::from(ReservedRegisters::NUM_RESERVED_REGISTERS + i)
    }

    /// Allocates an unused register.
    pub(crate) fn allocate_register(&mut self) -> MemoryAddress {
        self.registers.allocate_register()
    }

    pub(crate) fn set_allocated_registers(&mut self, allocated_registers: Vec<MemoryAddress>) {
        self.registers = BrilligRegistersContext::from_preallocated_registers(allocated_registers);
    }

    /// Push a register to the deallocation list, ready for reuse.
    pub(crate) fn deallocate_register(&mut self, register_index: MemoryAddress) {
        self.registers.deallocate_register(register_index);
    }

    /// Deallocates the address where the single address variable is stored
    pub(crate) fn deallocate_single_addr(&mut self, var: SingleAddrVariable) {
        self.deallocate_register(var.address);
    }

    /// This function moves values from a set of registers to another set of registers.
    /// It first moves all sources to new allocated registers to avoid overwriting.
    pub(crate) fn codegen_mov_registers_to_registers(
        &mut self,
        sources: Vec<MemoryAddress>,
        destinations: Vec<MemoryAddress>,
    ) {
        let new_sources: Vec<_> = sources
            .iter()
            .map(|source| {
                let new_source = self.allocate_register();
                self.mov_instruction(new_source, *source);
                new_source
            })
            .collect();
        for (new_source, destination) in new_sources.iter().zip(destinations.iter()) {
            self.mov_instruction(*destination, *new_source);
            self.deallocate_register(*new_source);
        }
    }

    /// Emits a `mov` instruction.
    ///
    /// Copies the value at `source` into `destination`
    pub(crate) fn mov_instruction(&mut self, destination: MemoryAddress, source: MemoryAddress) {
        self.debug_show.mov_instruction(destination, source);
        self.push_opcode(BrilligOpcode::Mov { destination, source });
    }

    /// Cast truncates the value to the given bit size and converts the type of the value in memory to that bit size.
    pub(crate) fn cast_instruction(
        &mut self,
        destination: SingleAddrVariable,
        source: SingleAddrVariable,
    ) {
        self.debug_show.cast_instruction(destination.address, source.address, destination.bit_size);
        self.push_opcode(BrilligOpcode::Cast {
            destination: destination.address,
            source: source.address,
            bit_size: destination.bit_size,
        });
    }

    /// Stores the value of `constant` in the `result` register
    pub(crate) fn const_instruction(&mut self, result: SingleAddrVariable, constant: Value) {
        self.debug_show.const_instruction(result.address, constant);
        self.constant(result, constant);
    }

    pub(super) fn constant(&mut self, result: SingleAddrVariable, constant: Value) {
        self.push_opcode(BrilligOpcode::Const {
            destination: result.address,
            value: constant,
            bit_size: result.bit_size,
        });
    }

    pub(crate) fn usize_const_instruction(&mut self, result: MemoryAddress, constant: Value) {
        self.const_instruction(SingleAddrVariable::new_usize(result), constant);
    }

    pub(super) fn usize_const(&mut self, result: MemoryAddress, constant: Value) {
        self.constant(SingleAddrVariable::new_usize(result), constant);
    }

    /// Returns a register which holds the value of a constant
    pub(crate) fn make_constant_instruction(
        &mut self,
        constant: Value,
        bit_size: u32,
    ) -> SingleAddrVariable {
        let var = SingleAddrVariable::new(self.allocate_register(), bit_size);
        self.const_instruction(var, constant);
        var
    }

    pub(super) fn make_constant(&mut self, constant: Value, bit_size: u32) -> SingleAddrVariable {
        let var = SingleAddrVariable::new(self.allocate_register(), bit_size);
        self.constant(var, constant);
        var
    }

    /// Returns a register which holds the value of an usize constant
    pub(crate) fn make_usize_constant_instruction(
        &mut self,
        constant: Value,
    ) -> SingleAddrVariable {
        let register = self.allocate_register();
        self.usize_const_instruction(register, constant);
        SingleAddrVariable::new_usize(register)
    }

    pub(super) fn make_usize_constant(&mut self, constant: Value) -> SingleAddrVariable {
        let register = self.allocate_register();
        self.usize_const(register, constant);
        SingleAddrVariable::new_usize(register)
    }
}
