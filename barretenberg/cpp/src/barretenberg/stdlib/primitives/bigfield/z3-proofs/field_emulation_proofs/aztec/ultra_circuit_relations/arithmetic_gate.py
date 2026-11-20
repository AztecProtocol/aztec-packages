"""Arithmetic gate constraints encoding.

Based on Barretenberg's UltraArithmeticRelation.
"""

from dataclasses import dataclass
from typing import List, Tuple

from z3 import BoolRef, If, IntVal

from field_emulation_proofs.aztec import bigfield
from field_emulation_proofs.aztec.native_field import NativeFieldElement
from field_emulation_proofs.aztec.utils import NativeFourTuple, fresh_four_tuple
from field_emulation_proofs.field_utils import modinv
from field_emulation_proofs.hoare_logic import WitnessBase
from field_emulation_proofs.solver_context import SolverContext


@dataclass
class ArithmeticRelationWitness(WitnessBase):
    """A row being constrained by an arithmetic gate, as well as the next row, selectors, and q_arith_value."""

    this_row: NativeFourTuple
    next_row: NativeFourTuple
    q_m: NativeFieldElement
    q_1: NativeFieldElement
    q_2: NativeFieldElement
    q_3: NativeFieldElement
    q_4: NativeFieldElement
    q_c: NativeFieldElement
    q_arith: NativeFieldElement

    @classmethod
    def fresh(cls, ctx: SolverContext) -> "ArithmeticRelationWitness":
        this_row = fresh_four_tuple("w", ctx=ctx)
        next_row = fresh_four_tuple("w_omega", ctx=ctx)
        q_m = NativeFieldElement.fresh("q_m", ctx=ctx)
        q_1 = NativeFieldElement.fresh("q_1", ctx=ctx)
        q_2 = NativeFieldElement.fresh("q_2", ctx=ctx)
        q_3 = NativeFieldElement.fresh("q_3", ctx=ctx)
        q_4 = NativeFieldElement.fresh("q_4", ctx=ctx)
        q_c = NativeFieldElement.fresh("q_c", ctx=ctx)
        q_arith = NativeFieldElement.fresh("q_arith", ctx=ctx)
        # Default q_arith_value is 1
        return ArithmeticRelationWitness(
            ctx=ctx,
            this_row=this_row,
            next_row=next_row,
            q_m=q_m,
            q_1=q_1,
            q_2=q_2,
            q_3=q_3,
            q_4=q_4,
            q_c=q_c,
            q_arith=q_arith,
        )


def arithmetic_polynomials(
    witness: ArithmeticRelationWitness,
) -> Tuple[NativeFieldElement, NativeFieldElement]:
    """Return an evaluation of the UltraArithmeticRelation polynomial, switching on q_arith_value.

    This returns two polynomial evaluations, since the arithmetic gate takes advantage
    of randomness to check multiple equalities under certain q_arith settings.

    Rather than modeling the negligible unsoundness here, we diverge slightly from reality
    and assume both expressions are guaranteed to be zero if their random linear combination
    is zero
    """
    w = witness.this_row
    w_omega = witness.next_row
    q_m = witness.q_m
    q_1 = witness.q_1
    q_2 = witness.q_2
    q_3 = witness.q_3
    q_4 = witness.q_4
    q_c = witness.q_c
    q_arith = witness.q_arith

    # q_arith == 0
    expr1_0 = NativeFieldElement(value=IntVal(0, ctx=witness.ctx.z3_ctx))
    expr2_0 = NativeFieldElement(value=IntVal(0, ctx=witness.ctx.z3_ctx))

    # q_arith == 1
    expr1_1 = (
        q_m * w[0] * w[1] + q_1 * w[0] + q_2 * w[1] + q_3 * w[2] + q_4 * w[3] + q_c
    )
    expr2_1 = NativeFieldElement(value=IntVal(0, ctx=witness.ctx.z3_ctx))

    # q_arith == 2
    half = NativeFieldElement(
        value=IntVal(modinv(2, modulus=bigfield.n), ctx=witness.ctx.z3_ctx)
    )
    assert half is not None
    expr1_2 = (
        half * q_m * w[0] * w[1]
        + q_1 * w[0]
        + q_2 * w[1]
        + q_3 * w[2]
        + q_4 * w[3]
        + q_c
        + w_omega[3]
    )
    expr2_2 = NativeFieldElement(value=IntVal(0, ctx=witness.ctx.z3_ctx))

    # q_arith == 3
    two = NativeFieldElement(value=IntVal(2, ctx=witness.ctx.z3_ctx))
    expr1_3 = q_1 * w[0] + q_2 * w[1] + q_3 * w[2] + q_4 * w[3] + q_c + two * w_omega[3]
    expr2_3 = w[0] + w[3] - w_omega[0] + q_m

    # For q_arith > 3
    q_arith_minus_3 = q_arith - 3
    q_arith_minus_1 = q_arith - 1
    expr1_gt3 = (
        q_arith_minus_3 * q_m * w[0] * w[1]
        + q_1 * w[0]
        + q_2 * w[1]
        + q_3 * w[2]
        + q_4 * w[3]
        + q_c
        + q_arith_minus_1 * w_omega[3]
    )
    expr2_gt3 = w[0] + w[3] - w_omega[0] + q_m

    def _select_expr(
        expr_0: NativeFieldElement,
        expr_1: NativeFieldElement,
        expr_2: NativeFieldElement,
        expr_3: NativeFieldElement,
        expr_gt3: NativeFieldElement,
    ) -> NativeFieldElement:
        expr_value = If(
            q_arith.eq_mod_native(0),
            expr_0.value,
            If(
                q_arith.eq_mod_native(1),
                expr_1.value,
                If(
                    q_arith.eq_mod_native(2),
                    expr_2.value,
                    If(q_arith.eq_mod_native(3), expr_3.value, expr_gt3.value),
                ),
            ),
        )
        return NativeFieldElement(value=expr_value)

    expr1 = _select_expr(expr1_0, expr1_1, expr1_2, expr1_3, expr1_gt3)
    expr2 = _select_expr(expr2_0, expr2_1, expr2_2, expr2_3, expr2_gt3)

    return (expr1, expr2)


def arithmetic_relation_constraint(witness: ArithmeticRelationWitness) -> List[BoolRef]:
    """Return expressions encoding the arithmetic relation as a constraint."""
    expr1, expr2 = arithmetic_polynomials(witness)
    constraints = [expr1.value == 0, expr2.value == 0]
    return constraints
