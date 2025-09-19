"""This module contains methods from field.cpp"""

from typing import List

from z3 import BoolRef, IntVal

from field_emulation_proofs.aztec.native_field import NativeFieldElement
from field_emulation_proofs.aztec.ultra_circuit_builder.create_big_mul_gate import (
    CreateBigMulGate,
    CreateBigMulGateWitness,
)
from field_emulation_proofs.solver_context import SolverContext


def field_t_evaluate_polynomial_identity(
    ctx: SolverContext,
    a: NativeFieldElement,
    b: NativeFieldElement,
    c: NativeFieldElement,
    d: NativeFieldElement,
) -> List[BoolRef]:
    """Just like field_t::evaluate_polynomial_identity()
    https://github.com/AztecProtocol/aztec-packages//blob/91b55c58278a7d091339ac513d633fa070d5276b/barretenberg/cpp/src/barretenberg/stdlib/primitives/field/field.cpp#L1085

    However, we are modeling all field elements as normalized

    Returns:
        List[BoolRef]: Constraints produced by the function
    """
    a_mult_constant = 1
    a_add_constant = 0
    b_mult_constant = 1
    b_add_constant = 0
    c_mult_constant = 1
    c_add_constant = 0
    d_mult_constant = 1
    d_add_constant = 0

    q_m = a_mult_constant * b_mult_constant
    q_1 = a_mult_constant * b_add_constant
    q_2 = b_mult_constant * a_add_constant
    q_3 = c_mult_constant
    q_4 = d_mult_constant
    q_c = a_add_constant * b_add_constant + c_add_constant + d_add_constant

    big_mul_gate_witness = CreateBigMulGateWitness(
        ctx=ctx,
        a=a,
        b=b,
        c=c,
        d=d,
        mul_scaling=NativeFieldElement(value=IntVal(q_m, ctx=ctx.z3_ctx)),
        a_scaling=NativeFieldElement(value=IntVal(q_1, ctx=ctx.z3_ctx)),
        b_scaling=NativeFieldElement(value=IntVal(q_2, ctx=ctx.z3_ctx)),
        c_scaling=NativeFieldElement(value=IntVal(q_3, ctx=ctx.z3_ctx)),
        d_scaling=NativeFieldElement(value=IntVal(q_4, ctx=ctx.z3_ctx)),
        const_scaling=NativeFieldElement(value=IntVal(q_c, ctx=ctx.z3_ctx)),
    )
    big_mul_gate = CreateBigMulGate(big_mul_gate_witness)
    return [big_mul_gate.get_consequence()]


def field_t_accumulate(
    fields: List[NativeFieldElement], ctx: SolverContext
) -> NativeFieldElement:
    """Just like field_t::accumulate()
    https://github.com/AztecProtocol/aztec-packages//blob/91b55c58278a7d091339ac513d633fa070d5276b/barretenberg/cpp/src/barretenberg/stdlib/primitives/field/field.cpp#L1125

    TODO: Actually prove that it is correct, and not just assume that it does as expected
    """
    if len(fields) <= 0:
        return IntVal(0, ctx=ctx.z3_ctx)
    if len(fields) == 1:
        return fields[0]

    total = fields[0]
    for field in fields[1:]:
        total += field
    return total
