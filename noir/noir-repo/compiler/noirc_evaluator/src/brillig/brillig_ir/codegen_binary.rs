use acvm::{
    acir::brillig::{BinaryFieldOp, BinaryIntOp, MemoryAddress, Opcode as BrilligOpcode, Value},
    FieldElement,
};

use super::{
    brillig_variable::SingleAddrVariable, BrilligBinaryOp, BrilligContext,
    BRILLIG_MEMORY_ADDRESSING_BIT_SIZE,
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
        assert!(
            lhs.bit_size == rhs.bit_size,
            "Not equal bit size for lhs and rhs: lhs {}, rhs {}",
            lhs.bit_size,
            rhs.bit_size
        );
        let expected_result_bit_size =
            BrilligContext::binary_result_bit_size(operation, lhs.bit_size);
        assert!(
            result.bit_size == expected_result_bit_size,
            "Expected result bit size to be {}, got {} for operation {:?}",
            expected_result_bit_size,
            result.bit_size,
            operation
        );
        self.debug_show.binary_instruction(lhs.address, rhs.address, result.address, operation);
        match operation {
            BrilligBinaryOp::Field(op) => {
                let opcode = BrilligOpcode::BinaryFieldOp {
                    op,
                    destination: result.address,
                    lhs: lhs.address,
                    rhs: rhs.address,
                };
                self.push_opcode(opcode);
            }
            BrilligBinaryOp::Integer(op) => {
                let opcode = BrilligOpcode::BinaryIntOp {
                    op,
                    destination: result.address,
                    bit_size: lhs.bit_size,
                    lhs: lhs.address,
                    rhs: rhs.address,
                };
                self.push_opcode(opcode);
            }
            BrilligBinaryOp::Modulo { is_signed_integer } => {
                self.modulo(result, lhs, rhs, is_signed_integer);
            }
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
    pub(super) fn modulo(
        &mut self,
        result: SingleAddrVariable,
        left: SingleAddrVariable,
        right: SingleAddrVariable,
        signed: bool,
    ) {
        let scratch_register_i = self.allocate_register();
        let scratch_register_j = self.allocate_register();

        assert!(
            left.bit_size == right.bit_size,
            "Not equal bitsize: lhs {}, rhs {}",
            left.bit_size,
            right.bit_size
        );
        let bit_size = left.bit_size;
        // i = left / right
        self.push_opcode(BrilligOpcode::BinaryIntOp {
            op: match signed {
                true => BinaryIntOp::SignedDiv,
                false => BinaryIntOp::UnsignedDiv,
            },
            destination: scratch_register_i,
            bit_size,
            lhs: left.address,
            rhs: right.address,
        });

        // j = i * right
        self.push_opcode(BrilligOpcode::BinaryIntOp {
            op: BinaryIntOp::Mul,
            destination: scratch_register_j,
            bit_size,
            lhs: scratch_register_i,
            rhs: right.address,
        });

        // result_register = left - j
        self.push_opcode(BrilligOpcode::BinaryIntOp {
            op: BinaryIntOp::Sub,
            destination: result.address,
            bit_size,
            lhs: left.address,
            rhs: scratch_register_j,
        });
        // Free scratch registers
        self.deallocate_register(scratch_register_i);
        self.deallocate_register(scratch_register_j);
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
        let max = self.make_constant_instruction(Value::from(u_max), input.bit_size);

        self.push_opcode(BrilligOpcode::BinaryIntOp {
            destination: result.address,
            op: BinaryIntOp::Sub,
            bit_size: input.bit_size,
            lhs: max.address,
            rhs: input.address,
        });
        self.deallocate_single_addr(max);
    }

    fn binary_result_bit_size(operation: BrilligBinaryOp, arguments_bit_size: u32) -> u32 {
        match operation {
            BrilligBinaryOp::Field(BinaryFieldOp::Equals)
            | BrilligBinaryOp::Integer(BinaryIntOp::Equals)
            | BrilligBinaryOp::Integer(BinaryIntOp::LessThan)
            | BrilligBinaryOp::Integer(BinaryIntOp::LessThanEquals) => 1,
            _ => arguments_bit_size,
        }
    }

    /// Utility method to perform a binary instruction with a constant value in place
    pub(crate) fn usize_op_in_place(
        &mut self,
        destination: MemoryAddress,
        op: BinaryIntOp,
        constant: usize,
    ) {
        self.usize_op(destination, destination, op, constant);
    }

    /// Utility method to perform a binary instruction with a constant value
    pub(crate) fn usize_op(
        &mut self,
        operand: MemoryAddress,
        destination: MemoryAddress,
        op: BinaryIntOp,
        constant: usize,
    ) {
        let const_register = self.make_usize_constant_instruction(Value::from(constant));
        self.memory_op(operand, const_register.address, destination, op);
        // Mark as no longer used for this purpose, frees for reuse
        self.deallocate_single_addr(const_register);
    }

    /// Utility method to perform a binary instruction with a memory address
    pub(crate) fn memory_op(
        &mut self,
        lhs: MemoryAddress,
        rhs: MemoryAddress,
        destination: MemoryAddress,
        op: BinaryIntOp,
    ) {
        self.binary_instruction(
            SingleAddrVariable::new_usize(lhs),
            SingleAddrVariable::new_usize(rhs),
            SingleAddrVariable::new(
                destination,
                BrilligContext::binary_result_bit_size(
                    BrilligBinaryOp::Integer(op),
                    BRILLIG_MEMORY_ADDRESSING_BIT_SIZE,
                ),
            ),
            BrilligBinaryOp::Integer(op),
        );
    }
}
