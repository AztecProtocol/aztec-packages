"""
Constraints encoding the ZK-constraints enforced by
UltraCircuitBuilder::create_big_mul_gate().

See
https://github.com/AztecProtocol/aztec-packages//blob/bd82c686ae5cc945a871a1817322b891dfe24349/barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/ultra_circuit_builder.cpp#L427
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import z3
from z3 import BoolRef

from field_emulation_proofs.aztec import bigfield, native_field
from field_emulation_proofs.aztec.native_field import NativeFieldElement
from field_emulation_proofs.aztec.ultra_circuit_relations.arithmetic_gate import (
    ArithmeticRelationWitness,
    arithmetic_relation_constraint,
)
from field_emulation_proofs.hoare_logic import HoareTriple, WitnessBase
from field_emulation_proofs.solver_context import SolverContext


@dataclass
class CreateBigMulGateWitness(WitnessBase):
    """Corresponds to mul_quad_"""

    a: NativeFieldElement
    b: NativeFieldElement
    c: NativeFieldElement
    d: NativeFieldElement
    mul_scaling: NativeFieldElement
    a_scaling: NativeFieldElement
    b_scaling: NativeFieldElement
    c_scaling: NativeFieldElement
    d_scaling: NativeFieldElement
    const_scaling: NativeFieldElement

    @classmethod
    def fresh(cls, ctx: SolverContext) -> "CreateBigMulGateWitness":
        """Create a fresh witness with no constraints on the
        new variables
        """
        a = NativeFieldElement.fresh("a", ctx=ctx)
        b = NativeFieldElement.fresh("b", ctx=ctx)
        c = NativeFieldElement.fresh("c", ctx=ctx)
        d = NativeFieldElement.fresh("d", ctx=ctx)

        mul_scaling = NativeFieldElement.fresh("mul_scaling", ctx=ctx)
        a_scaling = NativeFieldElement.fresh("a_scaling", ctx=ctx)
        b_scaling = NativeFieldElement.fresh("b_scaling", ctx=ctx)
        c_scaling = NativeFieldElement.fresh("c_scaling", ctx=ctx)
        d_scaling = NativeFieldElement.fresh("d_scaling", ctx=ctx)
        const_scaling = NativeFieldElement.fresh("const_scaling", ctx=ctx)

        witness = CreateBigMulGateWitness(
            ctx=ctx,
            a=a,
            b=b,
            c=c,
            d=d,
            mul_scaling=mul_scaling,
            a_scaling=a_scaling,
            b_scaling=b_scaling,
            c_scaling=c_scaling,
            d_scaling=d_scaling,
            const_scaling=const_scaling,
        )
        return witness

    def invariants(self) -> List[BoolRef]:
        """Invariants which should hold over the witness variables"""
        invariants = []
        for gate_var in self.vars():
            assert gate_var.modulus == bigfield.n
        for var in self.vars():
            invariants += var.invariants()

        for coeff in self.var_coeffs():
            invariants += coeff.invariants()

        return invariants

    def var_coeffs(self) -> List[NativeFieldElement]:
        constants = [
            self.mul_scaling,
            self.a_scaling,
            self.b_scaling,
            self.c_scaling,
            self.d_scaling,
        ]
        return constants

    def vars(self) -> List[NativeFieldElement]:
        vars = [self.a * self.b, self.a, self.b, self.c, self.d]
        return vars


class CreateBigMulGate(
    HoareTriple[CreateBigMulGateWitness], witness_cls=CreateBigMulGateWitness
):
    """Hoare Triple for the create_big_mul_gate() function"""

    def __init__(self, witness: CreateBigMulGateWitness):
        super().__init__(witness)
        self.arithmetic_relation_witness = ArithmeticRelationWitness.fresh(
            ctx=self.ctx()
        )

    def _default_tactics(self):
        z3_ctx = self.ctx().z3_ctx
        tactic = z3.Then(
            z3.With("simplify", rewrite_patterns=True, ctx=z3_ctx),
            "elim-term-ite",
            "simplify",
            "propagate-values",
            "propagate-ineqs",
            ctx=z3_ctx,
        )
        return tactic

    def _precondition(self):
        # We have to explicitly add our auxiliary witnesses invariants to ensure
        # the native field elements are actually in [0, n)
        preconditions = []
        bigfields = (
            self.arithmetic_relation_witness.this_row
            + self.arithmetic_relation_witness.next_row
        )
        for b in bigfields:
            preconditions += b.invariants()
        return preconditions

    def evaluate(self) -> List[BoolRef]:
        args = self.witness
        arithmetic_witness = self.arithmetic_relation_witness

        constraints = arithmetic_relation_constraint(arithmetic_witness)
        constraints += [
            arithmetic_witness.this_row[0].eq_mod_native(args.a),
            arithmetic_witness.this_row[1].eq_mod_native(args.b),
            arithmetic_witness.this_row[2].eq_mod_native(args.c),
            arithmetic_witness.this_row[3].eq_mod_native(args.d),
            arithmetic_witness.q_m.eq_mod_native(args.mul_scaling),
            arithmetic_witness.q_1.eq_mod_native(args.a_scaling),
            arithmetic_witness.q_2.eq_mod_native(args.b_scaling),
            arithmetic_witness.q_3.eq_mod_native(args.c_scaling),
            arithmetic_witness.q_c.eq_mod_native(args.const_scaling),
            arithmetic_witness.q_arith.eq_mod_native(1),
            arithmetic_witness.q_4.eq_mod_native(args.d_scaling),
        ]
        return constraints

    def postcondition(self) -> List[BoolRef]:
        gate_vars = self.witness.vars()
        gate_consts = self.witness.var_coeffs()
        scaled_sum = sum(
            [constant * var for constant, var in zip(gate_consts, gate_vars)]
        )
        scaled_sum = scaled_sum + self.witness.const_scaling
        exprs = [scaled_sum.eq_mod_native(0)]
        return exprs

    def lemmas(self) -> List[BoolRef]:
        constraints = []
        x = self.ctx().fresh_int("x")
        y = self.ctx().fresh_int("y")
        constraints.append(
            z3.ForAll(
                [x, y],
                z3.Implies(
                    z3.And(
                        x % native_field.n == y % native_field.n,
                        x >= 0,
                        x < native_field.n,
                        y >= 0,
                        y < native_field.n,
                    ),
                    x == y,
                ),
                patterns=[x % native_field.n == y % native_field.n],
            )
        )
        return constraints
