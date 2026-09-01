"""
Constraints encoding the ZK-constraints enforced by
UltraCircuitBuilder::create_big_add_gate().

See
https://github.com/AztecProtocol/aztec-packages//blob/bd82c686ae5cc945a871a1817322b891dfe24349/barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/ultra_circuit_builder.cpp#L331
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

from z3 import ArithRef, BoolRef, BoolVal, If

from field_emulation_proofs.aztec import bigfield
from field_emulation_proofs.aztec.native_field import NativeFieldElement
from field_emulation_proofs.aztec.ultra_circuit_relations.arithmetic_gate import (
    ArithmeticRelationWitness,
    arithmetic_relation_constraint,
)
from field_emulation_proofs.hoare_logic import HoareTriple, WitnessBase
from field_emulation_proofs.solver_context import SolverContext


@dataclass
class CreateBigAddGateWitness(WitnessBase):
    """Corresponds to add_quad_"""

    a: NativeFieldElement
    b: NativeFieldElement
    c: NativeFieldElement
    d: NativeFieldElement
    next_gate_w_4: NativeFieldElement
    a_scaling: int | ArithRef
    b_scaling: int | ArithRef
    c_scaling: int | ArithRef
    d_scaling: int | ArithRef
    const_scaling: int | ArithRef
    include_next_gate_w_4: bool | BoolRef = False

    @classmethod
    def fresh(cls, ctx: SolverContext) -> "CreateBigAddGateWitness":
        """Create a fresh witness with no constraints on the
        new variables
        """
        a = NativeFieldElement.fresh("a", ctx=ctx)
        b = NativeFieldElement.fresh("b", ctx=ctx)
        c = NativeFieldElement.fresh("c", ctx=ctx)
        d = NativeFieldElement.fresh("d", ctx=ctx)
        next_gate_w_4 = NativeFieldElement.fresh("next_gate_w_4", ctx=ctx)

        a_scaling = ctx.fresh_int("a_scaling")
        b_scaling = ctx.fresh_int("b_scaling")
        c_scaling = ctx.fresh_int("c_scaling")
        d_scaling = ctx.fresh_int("d_scaling")
        const_scaling = ctx.fresh_int("const_scaling")

        include_next_gate_w_4 = ctx.fresh_bool("include_next_gate_w_4")

        witness = CreateBigAddGateWitness(
            ctx=ctx,
            a=a,
            b=b,
            c=c,
            d=d,
            next_gate_w_4=next_gate_w_4,
            a_scaling=a_scaling,
            b_scaling=b_scaling,
            c_scaling=c_scaling,
            d_scaling=d_scaling,
            const_scaling=const_scaling,
            include_next_gate_w_4=include_next_gate_w_4,
        )
        return witness

    def invariants(self) -> List[BoolRef]:
        """Invariants which should hold over the witness variables"""
        for gate_var in self.vars():
            assert gate_var.modulus == bigfield.n
        invariants = []
        for var in self.vars():
            invariants += var.invariants()
        return invariants

    def var_coeffs(self) -> List[int | ArithRef]:
        constants = [
            self.a_scaling,
            self.b_scaling,
            self.c_scaling,
            self.d_scaling,
            # Need to specify ctx in case self.include_next_gate_w_4 is constant
            If(self.include_next_gate_w_4, 1, 0, ctx=self.ctx.z3_ctx),
        ]
        return constants

    def vars(self) -> List[NativeFieldElement]:
        vars = [self.a, self.b, self.c, self.d, self.next_gate_w_4]
        return vars


class CreateBigAddGate(
    HoareTriple[CreateBigAddGateWitness], witness_cls=CreateBigAddGateWitness
):
    """Hoare Triple for the create_big_add_gate() function"""

    def __init__(self, witness: CreateBigAddGateWitness):
        super().__init__(witness)
        self.arithmetic_relation_witness = ArithmeticRelationWitness.fresh(
            ctx=self.ctx()
        )

    def evaluate(self) -> List[BoolRef]:
        constraints = []
        args = self.witness
        arithmetic_witness = self.arithmetic_relation_witness

        # We have to explicitly add our auxiliary witnesses invariants to ensure
        # the native field elements are actually in [0, n)
        aux_bigfields = (
            self.arithmetic_relation_witness.this_row
            + self.arithmetic_relation_witness.next_row
        )
        for b in aux_bigfields:
            constraints += b.invariants()

        if isinstance(args.include_next_gate_w_4, bool):
            include_next_gate_w_4: BoolRef = BoolVal(
                args.include_next_gate_w_4, ctx=self.ctx().z3_ctx
            )
        else:
            include_next_gate_w_4 = args.include_next_gate_w_4

        constraints += arithmetic_relation_constraint(arithmetic_witness)
        constraints += [
            arithmetic_witness.this_row[0].eq_mod_native(args.a),
            arithmetic_witness.this_row[1].eq_mod_native(args.b),
            arithmetic_witness.this_row[2].eq_mod_native(args.c),
            arithmetic_witness.this_row[3].eq_mod_native(args.d),
            arithmetic_witness.next_row[3].eq_mod_native(args.next_gate_w_4),
            arithmetic_witness.q_m.value == 0,
            arithmetic_witness.q_1.value == args.a_scaling,
            arithmetic_witness.q_2.value == args.b_scaling,
            arithmetic_witness.q_3.value == args.c_scaling,
            arithmetic_witness.q_c.value == args.const_scaling,
            arithmetic_witness.q_arith.value == If(include_next_gate_w_4, 2, 1),
            arithmetic_witness.q_4.value == args.d_scaling,
        ]
        return constraints

    def postcondition(self) -> List[BoolRef]:
        gate_vars = self.witness.vars()
        gate_consts = self.witness.var_coeffs()
        scaled_sum = sum(
            [constant * var.value for constant, var in zip(gate_consts, gate_vars)]
        )
        scaled_sum = (scaled_sum + self.witness.const_scaling) % bigfield.n
        return [scaled_sum == 0]
