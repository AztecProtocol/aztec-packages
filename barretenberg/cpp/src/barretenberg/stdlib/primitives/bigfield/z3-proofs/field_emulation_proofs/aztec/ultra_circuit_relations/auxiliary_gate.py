"""Encoding of constraints for the auxiliary gates

Based on https://github.com/AztecProtocol/aztec-packages//blob/b62c86940e3f26ae9fa12edac0890ca915185ad0/barretenberg/cpp/src/barretenberg/relations/auxiliary_relation.hpp#L118-L202

For this, we are just directly encoding the constraints for each case, rather than
verifying anything about the auxiliary relation
"""

import enum
from dataclasses import dataclass
from typing import List

from z3 import BoolRef, IntVal

from field_emulation_proofs.aztec import bigfield
from field_emulation_proofs.aztec.native_field import NativeFieldElement
from field_emulation_proofs.aztec.utils import NativeFourTuple, fresh_four_tuple
from field_emulation_proofs.hoare_logic import WitnessBase
from field_emulation_proofs.solver_context import SolverContext


@dataclass
class AuxiliaryRelationWitness(WitnessBase):
    """A row being constrained by an auxiliary gate, as well as the next row"""

    this_row: NativeFourTuple
    next_row: NativeFourTuple

    @classmethod
    def fresh(cls, ctx: SolverContext) -> "AuxiliaryRelationWitness":
        this_row = fresh_four_tuple("w", ctx)
        next_row = fresh_four_tuple("w_omega", ctx)
        return AuxiliaryRelationWitness(ctx=ctx, this_row=this_row, next_row=next_row)


class AuxiliaryGateType(enum.Enum):
    """The type of auxiliary gate used"""

    NON_NATIVE_FIELD_1 = enum.auto()
    NON_NATIVE_FIELD_2 = enum.auto()
    NON_NATIVE_FIELD_3 = enum.auto()
    NONE = enum.auto()


def auxiliary_polynomial(
    gate_type: AuxiliaryGateType, witness: AuxiliaryRelationWitness
) -> NativeFieldElement:
    """Return an evaluation of the specified auxiliary relation polynomial

    Args:
        gate_type (AuxiliaryGateType): The type of auxiliary relation
        witness (AuxiliaryRelationWitness): The variables to apply the constraint to

    Raises:
        NotImplementedError: if the gate type is unrecognized

    Returns:
        NativeFieldElement: the polynomial evaluated at the provided witness
    """
    w = witness.this_row
    w_omega = witness.next_row
    L = bigfield.L
    bigfield.n

    limb_subproduct_gate_2 = w_omega[0] * w[1] + w[0] * w_omega[1]
    limb_subproduct_gate_13 = limb_subproduct_gate_2 * 2**L + w_omega[0] * w_omega[1]

    if gate_type == AuxiliaryGateType.NONE:
        return NativeFieldElement(value=IntVal(0, ctx=witness.ctx.z3_ctx))
    elif gate_type == AuxiliaryGateType.NON_NATIVE_FIELD_1:
        expr: NativeFieldElement = limb_subproduct_gate_13 - (w[2] + w[3])
    elif gate_type == AuxiliaryGateType.NON_NATIVE_FIELD_2:
        expr = (
            limb_subproduct_gate_2
            + (w[0] * w[3] + w[1] * w[2] - w_omega[2]) * 2**L
            - w_omega[3]
        )
    elif gate_type == AuxiliaryGateType.NON_NATIVE_FIELD_3:
        expr = limb_subproduct_gate_13 + w[3] - (w_omega[2] + w_omega[3])
    else:
        raise NotImplementedError(f"Unexpected gate type {gate_type}")
    return expr


def auxiliary_relation_constraint(
    gate_type: AuxiliaryGateType, witness: AuxiliaryRelationWitness
) -> List[BoolRef]:
    """Return expressions encoding the specified auxiliary relation as a constraint

    Args:
        gate_type (AuxiliaryGateType): The type of auxiliary relation
        witness (AuxiliaryRelationWitness): The variables to apply the constraint to

    Raises:
        NotImplementedError: if the gate type is unrecognized

    Returns:
        List[BoolRef]: the constraints encoding the auxiliary relation
    """
    expr = auxiliary_polynomial(gate_type, witness)
    return [expr.value == 0]
