use acvm::{
    acir::brillig::{BinaryFieldOp, BinaryIntOp, MemoryAddress, Opcode as BrilligOpcode, Value},
    FieldElement,
};

use super::{
    brillig_variable::SingleAddrVariable, BrilligContext, BRILLIG_MEMORY_ADDRESSING_BIT_SIZE,
};

impl BrilligContext {
    /// Processes a binary instruction according `operation`.
    ///
    /// This method will compute lhs <operation> rhs
    /// and store the result in the `result` register.
    pub(crate) fn binary_instruction(
        &mut self,
        lhs: SingleAddrVariable,
        rhs: SingleAddrVariable,
        result: SingleAddrVariable,
        operation: BrilligBinaryOp,
    ) {
        self.debug_show.binary_instruction(lhs.address, rhs.address, result.address, operation);
        self.binary(lhs, rhs, result, operation);
    }

    /// Processes a not instruction.
    ///
    /// Not is computed using a subtraction operation as there is no native not instruction
    /// in Brillig.
    pub(crate) fn not_instruction(
        &mut self,
        input: SingleAddrVariable,
        result: SingleAddrVariable,
    ) {
        self.debug_show.not_instruction(input.address, input.bit_size, result.address);
        // Compile !x as ((-1) - x)
        let u_max = FieldElement::from(2_i128).pow(&FieldElement::from(input.bit_size as i128))
            - FieldElement::one();
        let max = self.make_constant(Value::from(u_max), input.bit_size);

        self.binary(max, input, result, BrilligBinaryOp::Sub);
        self.deallocate_single_addr(max);
    }

    /// Utility method to perform a binary instruction with a constant value in place
    pub(crate) fn codegen_usize_op_in_place(
        &mut self,
        destination: MemoryAddress,
        op: BrilligBinaryOp,
        constant: usize,
    ) {
        self.codegen_usize_op(destination, destination, op, constant);
    }

    /// Utility method to perform a binary instruction with a constant value
    pub(crate) fn codegen_usize_op(
        &mut self,
        operand: MemoryAddress,
        destination: MemoryAddress,
        op: BrilligBinaryOp,
        constant: usize,
    ) {
        let const_register = self.make_usize_constant_instruction(Value::from(constant));
        self.memory_op_instruction(operand, const_register.address, destination, op);
        // Mark as no longer used for this purpose, frees for reuse
        self.deallocate_single_addr(const_register);
    }

    /// Utility method to perform a binary instruction with a memory address
    pub(crate) fn memory_op_instruction(
        &mut self,
        lhs: MemoryAddress,
        rhs: MemoryAddress,
        destination: MemoryAddress,
        op: BrilligBinaryOp,
    ) {
        self.binary_instruction(
            SingleAddrVariable::new_usize(lhs),
            SingleAddrVariable::new_usize(rhs),
            SingleAddrVariable::new(
                destination,
                BrilligContext::binary_result_bit_size(op, BRILLIG_MEMORY_ADDRESSING_BIT_SIZE),
            ),
            op,
        );
    }

    pub(super) fn memory_op(
        &mut self,
        lhs: MemoryAddress,
        rhs: MemoryAddress,
        destination: MemoryAddress,
        op: BrilligBinaryOp,
    ) {
        self.binary(
            SingleAddrVariable::new_usize(lhs),
            SingleAddrVariable::new_usize(rhs),
            SingleAddrVariable::new(
                destination,
                BrilligContext::binary_result_bit_size(op, BRILLIG_MEMORY_ADDRESSING_BIT_SIZE),
            ),
            op,
        );
    }

    fn binary(
        &mut self,
        lhs: SingleAddrVariable,
        rhs: SingleAddrVariable,
        result: SingleAddrVariable,
        operation: BrilligBinaryOp,
    ) {
        assert!(
            lhs.bit_size == rhs.bit_size,
            "Not equal bit size for lhs and rhs: lhs {}, rhs {}",
            lhs.bit_size,
            rhs.bit_size
        );
        let is_field_op = lhs.bit_size == FieldElement::max_num_bits();
        let expected_result_bit_size =
            BrilligContext::binary_result_bit_size(operation, lhs.bit_size);
        assert!(
            result.bit_size == expected_result_bit_size,
            "Expected result bit size to be {}, got {} for operation {:?}",
            expected_result_bit_size,
            result.bit_size,
            operation
        );

        if let BrilligBinaryOp::Modulo { is_signed_integer } = operation {
            self.modulo(result, lhs, rhs, is_signed_integer);
        } else if is_field_op {
            let opcode = BrilligOpcode::BinaryFieldOp {
                op: operation.into(),
                destination: result.address,
                lhs: lhs.address,
                rhs: rhs.address,
            };
            self.push_opcode(opcode);
        } else {
            let opcode = BrilligOpcode::BinaryIntOp {
                op: operation.into(),
                destination: result.address,
                bit_size: lhs.bit_size,
                lhs: lhs.address,
                rhs: rhs.address,
            };
            self.push_opcode(opcode);
        }
    }

    /// Computes left % right by emitting the necessary Brillig opcodes.
    ///
    /// This is done by using the following formula:
    ///
    /// a % b = a - (b * (a / b))
    ///
    /// Brillig does not have an explicit modulo operation,
    /// so we must emit multiple opcodes and process it differently
    /// to other binary instructions.
    fn modulo(
        &mut self,
        result: SingleAddrVariable,
        left: SingleAddrVariable,
        right: SingleAddrVariable,
        signed: bool,
    ) {
        assert!(
            left.bit_size == right.bit_size,
            "Not equal bitsize: lhs {}, rhs {}",
            left.bit_size,
            right.bit_size
        );
        let bit_size = left.bit_size;

        let scratch_var_i = SingleAddrVariable::new(self.allocate_register(), bit_size);
        let scratch_var_j = SingleAddrVariable::new(self.allocate_register(), bit_size);

        // i = left / right
        self.binary(
            left,
            right,
            scratch_var_i,
            match signed {
                true => BrilligBinaryOp::SignedDiv,
                false => BrilligBinaryOp::UnsignedDiv,
            },
        );

        // j = i * right
        self.binary(scratch_var_i, right, scratch_var_j, BrilligBinaryOp::Mul);

        // result_register = left - j
        self.binary(left, scratch_var_j, result, BrilligBinaryOp::Sub);
        // Free scratch registers
        self.deallocate_register(scratch_var_i.address);
        self.deallocate_register(scratch_var_j.address);
    }

    fn binary_result_bit_size(operation: BrilligBinaryOp, arguments_bit_size: u32) -> u32 {
        match operation {
            BrilligBinaryOp::Equals
            | BrilligBinaryOp::LessThan
            | BrilligBinaryOp::LessThanEquals => 1,
            _ => arguments_bit_size,
        }
    }
}

/// Type to encapsulate the binary operation types in Brillig
#[derive(Clone, Copy, Debug)]
pub(crate) enum BrilligBinaryOp {
    Add,
    Sub,
    Mul,
    FieldDiv,
    SignedDiv,
    UnsignedDiv,
    Equals,
    LessThan,
    LessThanEquals,
    And,
    Or,
    Xor,
    Shl,
    Shr,
    // Modulo operation requires more than one brillig opcode
    Modulo { is_signed_integer: bool },
}

impl From<BrilligBinaryOp> for BinaryFieldOp {
    fn from(operation: BrilligBinaryOp) -> BinaryFieldOp {
        match operation {
            BrilligBinaryOp::Add => BinaryFieldOp::Add,
            BrilligBinaryOp::Sub => BinaryFieldOp::Sub,
            BrilligBinaryOp::Mul => BinaryFieldOp::Mul,
            BrilligBinaryOp::FieldDiv => BinaryFieldOp::Div,
            BrilligBinaryOp::UnsignedDiv => BinaryFieldOp::IntegerDiv,
            BrilligBinaryOp::Equals => BinaryFieldOp::Equals,
            BrilligBinaryOp::LessThan => BinaryFieldOp::LessThan,
            BrilligBinaryOp::LessThanEquals => BinaryFieldOp::LessThanEquals,
            _ => panic!("Unsupported operation: {:?} on a field", operation),
        }
    }
}

impl From<BrilligBinaryOp> for BinaryIntOp {
    fn from(operation: BrilligBinaryOp) -> BinaryIntOp {
        match operation {
            BrilligBinaryOp::Add => BinaryIntOp::Add,
            BrilligBinaryOp::Sub => BinaryIntOp::Sub,
            BrilligBinaryOp::Mul => BinaryIntOp::Mul,
            BrilligBinaryOp::UnsignedDiv => BinaryIntOp::UnsignedDiv,
            BrilligBinaryOp::SignedDiv => BinaryIntOp::SignedDiv,
            BrilligBinaryOp::Equals => BinaryIntOp::Equals,
            BrilligBinaryOp::LessThan => BinaryIntOp::LessThan,
            BrilligBinaryOp::LessThanEquals => BinaryIntOp::LessThanEquals,
            BrilligBinaryOp::And => BinaryIntOp::And,
            BrilligBinaryOp::Or => BinaryIntOp::Or,
            BrilligBinaryOp::Xor => BinaryIntOp::Xor,
            BrilligBinaryOp::Shl => BinaryIntOp::Shl,
            BrilligBinaryOp::Shr => BinaryIntOp::Shr,
            _ => panic!("Unsupported operation: {:?} on an integer", operation),
        }
    }
}
