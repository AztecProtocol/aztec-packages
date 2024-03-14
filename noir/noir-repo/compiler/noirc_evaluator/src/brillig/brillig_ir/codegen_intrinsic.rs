use acvm::{
    acir::brillig::{BinaryIntOp, BlackBoxOp, Opcode as BrilligOpcode},
    FieldElement,
};

use crate::brillig::brillig_ir::BrilligBinaryOp;

use super::{
    brillig_variable::{BrilligVector, SingleAddrVariable},
    BrilligContext,
};

impl BrilligContext {
    /// Emits a truncate instruction.
    ///
    /// Note: Truncation is used as an optimization in the SSA IR
    /// for the ACIR generation pass; ACIR gen does not overflow
    /// on every integer operation since it would be in-efficient.
    /// Instead truncation instructions are emitted as to when a
    /// truncation should be done.
    /// For Brillig, all integer operations will overflow as its cheap.
    /// We currently use cast to truncate: we cast to the required bit size
    /// and back to the original bit size.
    pub(crate) fn truncate_instruction(
        &mut self,
        destination_of_truncated_value: SingleAddrVariable,
        value_to_truncate: SingleAddrVariable,
        bit_size: u32,
    ) {
        self.debug_show.truncate_instruction(
            destination_of_truncated_value.address,
            value_to_truncate.address,
            bit_size,
        );
        assert!(
            bit_size <= value_to_truncate.bit_size,
            "tried to truncate to a bit size {} greater than the variable size {}",
            bit_size,
            value_to_truncate.bit_size
        );

        // We cast back and forth to ensure that the value is truncated.
        let intermediate_register =
            SingleAddrVariable { address: self.allocate_register(), bit_size };
        self.cast_instruction(intermediate_register, value_to_truncate);
        self.cast_instruction(destination_of_truncated_value, intermediate_register);
        self.deallocate_register(intermediate_register.address);
    }

    /// Issues a blackbox operation.
    pub(crate) fn black_box_op_instruction(&mut self, op: BlackBoxOp) {
        self.debug_show.black_box_op_instruction(&op);
        self.push_opcode(BrilligOpcode::BlackBox(op));
    }

    /// Issues a to_radix instruction. This instruction will write the modulus of the source register
    /// And the radix register limb_count times to the target vector.
    pub(crate) fn radix_instruction(
        &mut self,
        source_field: SingleAddrVariable,
        target_vector: BrilligVector,
        radix: SingleAddrVariable,
        limb_count: SingleAddrVariable,
        big_endian: bool,
    ) {
        assert!(source_field.bit_size == FieldElement::max_num_bits());
        assert!(radix.bit_size == 32);
        assert!(limb_count.bit_size == 32);
        let radix_as_field =
            SingleAddrVariable::new(self.allocate_register(), FieldElement::max_num_bits());
        self.cast_instruction(radix_as_field, radix);

        self.cast_instruction(SingleAddrVariable::new_usize(target_vector.size), limb_count);
        self.usize_const_instruction(target_vector.rc, 1_usize.into());
        self.allocate_array_instruction(target_vector.pointer, target_vector.size);

        let shifted_field =
            SingleAddrVariable::new(self.allocate_register(), FieldElement::max_num_bits());
        self.mov_instruction(shifted_field.address, source_field.address);

        let modulus_field =
            SingleAddrVariable::new(self.allocate_register(), FieldElement::max_num_bits());

        self.loop_instruction(target_vector.size, |ctx, iterator_register| {
            // Compute the modulus
            ctx.modulo(modulus_field, shifted_field, radix_as_field, false);
            // Write it
            ctx.array_set(target_vector.pointer, iterator_register, modulus_field.address);
            // Integer div the field
            ctx.binary_instruction(
                shifted_field,
                radix_as_field,
                shifted_field,
                BrilligBinaryOp::Integer(BinaryIntOp::UnsignedDiv),
            );
        });

        // Deallocate our temporary registers
        self.deallocate_single_addr(shifted_field);
        self.deallocate_single_addr(modulus_field);
        self.deallocate_single_addr(radix_as_field);

        if big_endian {
            self.reverse_vector_in_place_instruction(target_vector);
        }
    }
}
