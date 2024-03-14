use acvm::acir::brillig::{BinaryIntOp, MemoryAddress, Opcode as BrilligOpcode};

use crate::brillig::brillig_ir::BrilligBinaryOp;

use super::{
    brillig_variable::{BrilligArray, BrilligVariable, BrilligVector, SingleAddrVariable},
    BrilligContext, ReservedRegisters, BRILLIG_MEMORY_ADDRESSING_BIT_SIZE,
};

impl BrilligContext {
    pub(crate) fn load_free_memory_pointer_instruction(&mut self, pointer_register: MemoryAddress) {
        self.debug_show.mov_instruction(pointer_register, ReservedRegisters::stack_pointer());
        self.push_opcode(BrilligOpcode::Mov {
            destination: pointer_register,
            source: ReservedRegisters::stack_pointer(),
        });
    }

    pub(crate) fn increase_free_memory_pointer_instruction(
        &mut self,
        size_register: MemoryAddress,
    ) {
        self.memory_op_instruction(
            ReservedRegisters::stack_pointer(),
            size_register,
            ReservedRegisters::stack_pointer(),
            BinaryIntOp::Add,
        );
    }

    /// Allocates an array of size `size` and stores the pointer to the array
    /// in `pointer_register`
    pub(crate) fn allocate_fixed_length_array(
        &mut self,
        pointer_register: MemoryAddress,
        size: usize,
    ) {
        // debug_show handled by allocate_array_instruction
        let size_register = self.make_usize_constant_instruction(size.into());
        self.allocate_array_instruction(pointer_register, size_register.address);
        self.deallocate_single_addr(size_register);
    }

    /// Allocates an array of size contained in size_register and stores the
    /// pointer to the array in `pointer_register`
    pub(crate) fn allocate_array_instruction(
        &mut self,
        pointer_register: MemoryAddress,
        size_register: MemoryAddress,
    ) {
        self.debug_show.allocate_array_instruction(pointer_register, size_register);
        self.load_free_memory_pointer_instruction(pointer_register);
        self.increase_free_memory_pointer_instruction(size_register);
    }

    /// Allocates a variable in memory and stores the
    /// pointer to the array in `pointer_register`
    fn allocate_variable_reference_instruction(
        &mut self,
        pointer_register: MemoryAddress,
        size: usize,
    ) {
        self.debug_show.allocate_instruction(pointer_register);
        // A variable can be stored in up to three values, so we reserve three values for that.
        let size_register = self.make_usize_constant_instruction(size.into());
        self.push_opcode(BrilligOpcode::Mov {
            destination: pointer_register,
            source: ReservedRegisters::stack_pointer(),
        });
        self.memory_op_instruction(
            ReservedRegisters::stack_pointer(),
            size_register.address,
            ReservedRegisters::stack_pointer(),
            BinaryIntOp::Add,
        );
        self.deallocate_single_addr(size_register);
    }

    pub(crate) fn allocate_single_addr_reference_instruction(
        &mut self,
        pointer_register: MemoryAddress,
    ) {
        self.allocate_variable_reference_instruction(pointer_register, 1);
    }

    pub(crate) fn allocate_array_reference_instruction(&mut self, pointer_register: MemoryAddress) {
        self.allocate_variable_reference_instruction(
            pointer_register,
            BrilligArray::registers_count(),
        );
    }

    pub(crate) fn allocate_vector_reference_instruction(
        &mut self,
        pointer_register: MemoryAddress,
    ) {
        self.allocate_variable_reference_instruction(
            pointer_register,
            BrilligVector::registers_count(),
        );
    }

    /// Gets the value in the array at index `index` and stores it in `result`
    pub(crate) fn array_get(
        &mut self,
        array_ptr: MemoryAddress,
        index: SingleAddrVariable,
        result: MemoryAddress,
    ) {
        assert!(index.bit_size == BRILLIG_MEMORY_ADDRESSING_BIT_SIZE);
        self.debug_show.array_get(array_ptr, index.address, result);
        // Computes array_ptr + index, ie array[index]
        let index_of_element_in_memory = self.allocate_register();
        self.memory_op_instruction(
            array_ptr,
            index.address,
            index_of_element_in_memory,
            BinaryIntOp::Add,
        );
        self.load_instruction(result, index_of_element_in_memory);
        // Free up temporary register
        self.deallocate_register(index_of_element_in_memory);
    }

    /// Sets the item in the array at index `index` to `value`
    pub(crate) fn array_set(
        &mut self,
        array_ptr: MemoryAddress,
        index: SingleAddrVariable,
        value: MemoryAddress,
    ) {
        assert!(index.bit_size == BRILLIG_MEMORY_ADDRESSING_BIT_SIZE);
        self.debug_show.array_set(array_ptr, index.address, value);
        // Computes array_ptr + index, ie array[index]
        let index_of_element_in_memory = self.allocate_register();
        self.binary_instruction(
            SingleAddrVariable::new_usize(array_ptr),
            index,
            SingleAddrVariable::new_usize(index_of_element_in_memory),
            BrilligBinaryOp::Integer(BinaryIntOp::Add),
        );

        self.store_instruction(index_of_element_in_memory, value);
        // Free up temporary register
        self.deallocate_register(index_of_element_in_memory);
    }

    /// Copies the values of an array pointed by source with length stored in `num_elements_register`
    /// Into the array pointed by destination
    pub(crate) fn copy_array_instruction(
        &mut self,
        source_pointer: MemoryAddress,
        destination_pointer: MemoryAddress,
        num_elements_variable: SingleAddrVariable,
    ) {
        assert!(num_elements_variable.bit_size == BRILLIG_MEMORY_ADDRESSING_BIT_SIZE);
        self.debug_show.copy_array_instruction(
            source_pointer,
            destination_pointer,
            num_elements_variable.address,
        );

        let value_register = self.allocate_register();

        self.codegen_loop(num_elements_variable.address, |ctx, iterator| {
            ctx.array_get(source_pointer, iterator, value_register);
            ctx.array_set(destination_pointer, iterator, value_register);
        });

        self.deallocate_register(value_register);
    }

    /// Loads a variable stored previously
    pub(crate) fn load_variable_instruction(
        &mut self,
        destination: BrilligVariable,
        variable_pointer: MemoryAddress,
    ) {
        match destination {
            BrilligVariable::SingleAddr(single_addr) => {
                self.load_instruction(single_addr.address, variable_pointer);
            }
            BrilligVariable::BrilligArray(BrilligArray { pointer, size: _, rc }) => {
                self.load_instruction(pointer, variable_pointer);

                let rc_pointer = self.allocate_register();
                self.mov_instruction(rc_pointer, variable_pointer);
                self.usize_op_in_place_instruction(rc_pointer, BinaryIntOp::Add, 1_usize);

                self.load_instruction(rc, rc_pointer);
                self.deallocate_register(rc_pointer);
            }
            BrilligVariable::BrilligVector(BrilligVector { pointer, size, rc }) => {
                self.load_instruction(pointer, variable_pointer);

                let size_pointer = self.allocate_register();
                self.mov_instruction(size_pointer, variable_pointer);
                self.usize_op_in_place_instruction(size_pointer, BinaryIntOp::Add, 1_usize);

                self.load_instruction(size, size_pointer);
                self.deallocate_register(size_pointer);

                let rc_pointer = self.allocate_register();
                self.mov_instruction(rc_pointer, variable_pointer);
                self.usize_op_in_place_instruction(rc_pointer, BinaryIntOp::Add, 2_usize);

                self.load_instruction(rc, rc_pointer);
                self.deallocate_register(rc_pointer);
            }
        }
    }

    /// Emits a store instruction
    pub(crate) fn store_instruction(
        &mut self,
        destination_pointer: MemoryAddress,
        source: MemoryAddress,
    ) {
        self.debug_show.store_instruction(destination_pointer, source);
        self.push_opcode(BrilligOpcode::Store { destination_pointer, source });
    }

    /// Stores a variable by saving its registers to memory
    pub(crate) fn store_variable_instruction(
        &mut self,
        variable_pointer: MemoryAddress,
        source: BrilligVariable,
    ) {
        match source {
            BrilligVariable::SingleAddr(single_addr) => {
                self.store_instruction(variable_pointer, single_addr.address);
            }
            BrilligVariable::BrilligArray(BrilligArray { pointer, size: _, rc }) => {
                self.store_instruction(variable_pointer, pointer);

                let rc_pointer: MemoryAddress = self.allocate_register();
                self.mov_instruction(rc_pointer, variable_pointer);
                self.usize_op_in_place_instruction(rc_pointer, BinaryIntOp::Add, 1_usize);
                self.store_instruction(rc_pointer, rc);
                self.deallocate_register(rc_pointer);
            }
            BrilligVariable::BrilligVector(BrilligVector { pointer, size, rc }) => {
                self.store_instruction(variable_pointer, pointer);

                let size_pointer = self.allocate_register();
                self.mov_instruction(size_pointer, variable_pointer);
                self.usize_op_in_place_instruction(size_pointer, BinaryIntOp::Add, 1_usize);
                self.store_instruction(size_pointer, size);

                let rc_pointer: MemoryAddress = self.allocate_register();
                self.mov_instruction(rc_pointer, variable_pointer);
                self.usize_op_in_place_instruction(rc_pointer, BinaryIntOp::Add, 2_usize);
                self.store_instruction(rc_pointer, rc);

                self.deallocate_register(size_pointer);
                self.deallocate_register(rc_pointer);
            }
        }
    }

    /// This instruction will reverse the order of the elements in a vector.
    pub(crate) fn reverse_vector_in_place_instruction(&mut self, vector: BrilligVector) {
        let iteration_count = self.allocate_register();
        self.usize_op_instruction(vector.size, iteration_count, BinaryIntOp::UnsignedDiv, 2);

        let start_value_register = self.allocate_register();
        let index_at_end_of_array = self.allocate_register();
        let end_value_register = self.allocate_register();

        self.codegen_loop(iteration_count, |ctx, iterator_register| {
            // Load both values
            ctx.array_get(vector.pointer, iterator_register, start_value_register);

            // The index at the end of array is size - 1 - iterator
            ctx.mov_instruction(index_at_end_of_array, vector.size);
            ctx.usize_op_in_place_instruction(index_at_end_of_array, BinaryIntOp::Sub, 1);
            ctx.memory_op_instruction(
                index_at_end_of_array,
                iterator_register.address,
                index_at_end_of_array,
                BinaryIntOp::Sub,
            );

            ctx.array_get(
                vector.pointer,
                SingleAddrVariable::new_usize(index_at_end_of_array),
                end_value_register,
            );

            // Write both values
            ctx.array_set(vector.pointer, iterator_register, end_value_register);
            ctx.array_set(
                vector.pointer,
                SingleAddrVariable::new_usize(index_at_end_of_array),
                start_value_register,
            );
        });

        self.deallocate_register(iteration_count);
        self.deallocate_register(start_value_register);
        self.deallocate_register(end_value_register);
        self.deallocate_register(index_at_end_of_array);
    }

    /// Utility method to transform a HeapArray to a HeapVector by making a runtime constant with the size.
    pub(crate) fn array_to_vector(&mut self, array: &BrilligArray) -> BrilligVector {
        let size_register = self.make_usize_constant_instruction(array.size.into());
        BrilligVector { size: size_register.address, pointer: array.pointer, rc: array.rc }
    }

    /// Emits a load instruction
    pub(crate) fn load_instruction(
        &mut self,
        destination: MemoryAddress,
        source_pointer: MemoryAddress,
    ) {
        self.debug_show.load_instruction(destination, source_pointer);
        self.push_opcode(BrilligOpcode::Load { destination, source_pointer });
    }
}
