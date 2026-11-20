"""
Constraints encoding the ZK-constraints enforced by
UltraCircuitBuilder::evaluate_non_native_field_multiplication().

See
https://github.com/AztecProtocol/aztec-packages//blob/bd82c686ae5cc945a871a1817322b891dfe24349/barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/ultra_circuit_builder.cpp#L1696
"""

from dataclasses import dataclass
from typing import Dict, Final, List, Tuple

import z3
from z3 import And, ArithRef, BoolRef, If, Implies, IntVal

from field_emulation_proofs.aztec import bigfield
from field_emulation_proofs.aztec.native_field import NativeFieldElement
from field_emulation_proofs.aztec.ultra_circuit_builder.create_big_add_gate import (
    CreateBigAddGate,
    CreateBigAddGateWitness,
)
from field_emulation_proofs.aztec.ultra_circuit_relations.auxiliary_gate import (
    AuxiliaryGateType,
    AuxiliaryRelationWitness,
    auxiliary_relation_constraint,
)
from field_emulation_proofs.aztec.utils import (
    FourTuple,
    NativeClosedInterval,
    NativeFourTuple,
    fresh_four_tuple,
    multiply_mod_two_to_T,
    signed_field_to_int,
    to_four_tuple,
)
from field_emulation_proofs.field_utils import modinv
from field_emulation_proofs.hoare_logic import HoareTriple, WitnessBase
from field_emulation_proofs.solver_context import SolverContext

ConstantFourTuple = Tuple[int, int, int, int]


def _int_to_four_tuple(value: int) -> ConstantFourTuple:
    assert value >= 0
    assert value < 2**bigfield.T
    four_tuple = [value // 2 ** (i * bigfield.L) % 2**bigfield.L for i in range(4)]
    return tuple(four_tuple)


@dataclass
class NonNativeMultiplicationWitnesses(WitnessBase):
    """Witness values provided as input to the
    evaluation non-native field multiplication gate
    """

    a: NativeFourTuple
    b: NativeFourTuple
    q: NativeFourTuple
    r: NativeFourTuple

    return_value_lo: NativeFieldElement
    return_value_hi: NativeFieldElement

    neg_modulus: Final[int] = 2**bigfield.T - bigfield.p
    """Negative modulus modulo 2**T"""
    neg_modulus_limbs: Final[ConstantFourTuple] = _int_to_four_tuple(neg_modulus)
    """68-bit limbs of neg_modulus"""

    @classmethod
    def fresh(cls, ctx: SolverContext) -> "NonNativeMultiplicationWitnesses":
        a = fresh_four_tuple("a", ctx=ctx)
        b = fresh_four_tuple("b", ctx=ctx)
        q = fresh_four_tuple("q", ctx=ctx)
        r = fresh_four_tuple("r", ctx=ctx)
        return_value_lo = NativeFieldElement.fresh("return_value_lo", ctx=ctx)
        return_value_hi = NativeFieldElement.fresh("return_value_hi", ctx=ctx)
        return NonNativeMultiplicationWitnesses(
            ctx=ctx,
            a=a,
            b=b,
            q=q,
            r=r,
            return_value_lo=return_value_lo,
            return_value_hi=return_value_hi,
        )

    def invariants(self):
        invariants = []
        for four_tuple in [self.a, self.b, self.q, self.r]:
            for var in four_tuple:
                invariants += var.invariants()
        return invariants


class EvaluateNonNativeFieldMultiplication(
    HoareTriple[NonNativeMultiplicationWitnesses],
    witness_cls=NonNativeMultiplicationWitnesses,
):
    """Hoare triple for the evaluate_non_native_field_multiplication() function"""

    def __init__(self, witness: NonNativeMultiplicationWitnesses):
        super().__init__(witness)
        LIMB_SHIFT = 2**bigfield.L
        LIMB_RSHIFT = modinv(2**bigfield.L, modulus=bigfield.n)
        LIMB_RSHIFT_2 = modinv(2 ** (2 * bigfield.L), modulus=bigfield.n)
        assert LIMB_RSHIFT is not None
        assert LIMB_RSHIFT_2 is not None

        aux_var_names = ["lo_0", "lo_1", "hi_0", "hi_1", "hi_2", "hi_3"]
        aux_vars: Dict[str, NativeFieldElement] = {
            var_name: NativeFieldElement.fresh(var_name, ctx=self.ctx())
            for var_name in aux_var_names
        }

        self.LIMB_SHIFT = LIMB_SHIFT
        self.LIMB_RSHIFT = LIMB_RSHIFT
        self.LIMB_RSHIFT_2 = LIMB_RSHIFT_2
        self.aux_vars = aux_vars
        self.lo_0 = aux_vars["lo_0"]
        self.lo_1 = aux_vars["lo_1"]
        self.hi_0 = aux_vars["hi_0"]
        self.hi_1 = aux_vars["hi_1"]
        self.hi_2 = aux_vars["hi_2"]
        self.hi_3 = aux_vars["hi_3"]

    def _big_add_gate_witness_to_constraints(
        self, create_big_add_gate_witness: CreateBigAddGateWitness
    ):
        gate = CreateBigAddGate(create_big_add_gate_witness)
        return [gate.get_consequence()]

    def _product_gate_one(self) -> List[BoolRef]:
        """The first big-add gate (and the next dummy gate).
        Referred to as product_gate_one in the Aztec comments
        """
        args = self.witness
        witness = CreateBigAddGateWitness(
            ctx=self.ctx(),
            a=args.q[0],
            b=args.q[1],
            c=args.r[1],
            d=self.lo_1,
            next_gate_w_4=self.lo_0,
            a_scaling=args.neg_modulus_limbs[0]
            + args.neg_modulus_limbs[1] * self.LIMB_SHIFT,
            b_scaling=args.neg_modulus_limbs[0] * self.LIMB_SHIFT,
            c_scaling=bigfield.n - self.LIMB_SHIFT,
            d_scaling=(bigfield.n - self.LIMB_SHIFT) * self.LIMB_SHIFT % bigfield.n,
            const_scaling=0,
            include_next_gate_w_4=True,
        )
        return self._big_add_gate_witness_to_constraints(witness)

    def _auxiliary_rows(self) -> List[NativeFourTuple]:
        """Values passed to auxiliary gates

        Returns:
            List[NativeFourTuple]: The values used for each row of the auxiliary gates,
                and the row directly after the last auxiliary row (i.e. 5 rows)
        """
        args = self.witness
        auxiliary_rows = [
            (args.a[1], args.b[1], args.r[0], self.lo_0),
            (args.a[0], args.b[0], args.a[3], args.b[3]),
            (args.a[2], args.b[2], args.r[3], self.hi_0),
            (args.a[1], args.b[1], args.r[2], self.hi_1),
            # product_gate_six row, we need this to fill in the "next row" for the
            # fourth auxiliary gate.
            #
            # Since the fourth gate applies no constraints, we don't *technically* need
            # to do this, but better to include this and match our model closer to reality
            # than to allow for an error due to incorrect assumptions
            (args.q[2], args.q[3], self.lo_1, self.hi_1),
        ]
        return auxiliary_rows

    def _auxiliary_gates(self) -> List[BoolRef]:
        """Return the constraints enforced by each auxiliary gate"""
        auxiliary_rows = self._auxiliary_rows()
        assert len(auxiliary_rows) == 5
        constraints = []
        gate_types = [
            AuxiliaryGateType.NON_NATIVE_FIELD_1,
            AuxiliaryGateType.NON_NATIVE_FIELD_2,
            AuxiliaryGateType.NON_NATIVE_FIELD_3,
            AuxiliaryGateType.NONE,
        ]
        for i, gate_type in enumerate(gate_types):
            witness = AuxiliaryRelationWitness(
                ctx=self.ctx(),
                this_row=auxiliary_rows[i],
                next_row=auxiliary_rows[i + 1],
            )
            constraints += auxiliary_relation_constraint(gate_type, witness)
        return constraints

    def _gate_seven_w_4(self) -> NativeFieldElement:
        """Get the fourth witness used in the product gate 7"""
        return self.hi_2

    def _product_gate_six(self) -> List[BoolRef]:
        """The second big-add gate
        Referred to as product gate six in the Aztec comments
        """
        args = self.witness
        auxiliary_rows = self._auxiliary_rows()
        gate_six_row = auxiliary_rows[-1]
        gate_seven_w_4 = self._gate_seven_w_4()

        product_gate_six_inputs = CreateBigAddGateWitness(
            ctx=self.ctx(),
            a=gate_six_row[0],
            b=gate_six_row[1],
            c=gate_six_row[2],
            d=gate_six_row[3],
            next_gate_w_4=gate_seven_w_4,
            a_scaling=(
                (bigfield.n - args.neg_modulus_limbs[1]) * self.LIMB_SHIFT
                + bigfield.n
                - args.neg_modulus_limbs[0]
            )
            % bigfield.n,
            b_scaling=(bigfield.n - args.neg_modulus_limbs[0])
            * self.LIMB_SHIFT
            % bigfield.n,
            c_scaling=bigfield.n - 1,
            d_scaling=bigfield.n - 1,
            const_scaling=0,
            include_next_gate_w_4=True,
        )
        return self._big_add_gate_witness_to_constraints(product_gate_six_inputs)

    def _product_gate_seven(self) -> List[BoolRef]:
        """The third and final big-add gate
        Referred to as product gate seven in the Aztec comments
        """
        args = self.witness
        next_gate_w_4 = NativeFieldElement.fresh("_next_gate_w_4", ctx=self.ctx())
        # Called product gate seven in the comments
        product_gate_seven_inputs = CreateBigAddGateWitness(
            ctx=self.ctx(),
            a=self.hi_3,
            b=args.q[0],
            c=args.q[1],
            d=self._gate_seven_w_4(),
            next_gate_w_4=next_gate_w_4,  # Arbitrary next value
            a_scaling=bigfield.n - 1,
            b_scaling=(
                args.neg_modulus_limbs[3] * self.LIMB_RSHIFT
                + args.neg_modulus_limbs[2] * self.LIMB_RSHIFT_2
            )
            % bigfield.n,
            c_scaling=(
                args.neg_modulus_limbs[2] * self.LIMB_RSHIFT
                + args.neg_modulus_limbs[1] * self.LIMB_RSHIFT_2
            )
            % bigfield.n,
            d_scaling=self.LIMB_RSHIFT_2,
            const_scaling=0,
        )
        # Require our fresh random element to be a valid native field element
        constraints = next_gate_w_4.invariants()
        constraints += self._big_add_gate_witness_to_constraints(
            product_gate_seven_inputs
        )
        return constraints

    def evaluate(self) -> List[BoolRef]:
        constraints: List[BoolRef] = []

        # Ensure all aux vars are actual native field elements
        for aux_var in self.aux_vars.values():
            constraints += aux_var.invariants()

        args = self.witness

        # Apply gate constraints
        constraints += self._product_gate_one()
        constraints += self._auxiliary_gates()
        constraints += self._product_gate_six()
        constraints += self._product_gate_seven()

        # Finally, set return values
        constraints.append(args.return_value_lo.value == self.lo_1.value % bigfield.n)
        constraints.append(args.return_value_hi.value == self.hi_3.value % bigfield.n)

        return constraints

    def _precondition(self) -> List[BoolRef]:
        constraints = []
        # For this to hold, we need to bound all of the values
        args = self.witness
        for four_tuple in [args.a, args.b, args.q]:
            for limb in four_tuple:
                constraints.append(limb.value < 2**bigfield.PROHIBITED_LIMB_BITS)
        for limb in args.r:
            # r is sum(remainders) - sum(to_add), each a vector of at most 2**k entries
            constraints.append(
                z3.Or(
                    limb.value < 2 ** (bigfield.k + bigfield.PROHIBITED_LIMB_BITS),
                    limb.value
                    >= bigfield.n - 2 ** (bigfield.k + bigfield.PROHIBITED_LIMB_BITS),
                )
            )
        return constraints

    def _get_lo_hi(self) -> Tuple[ArithRef, ArithRef]:
        """Return the lo and hi components of ab + (2^T - p) * q - r, with
        any terms divisible by 2^T dropped,

        i.e. lo is the terms from the product with
        """
        args = self.witness

        # Compute the total value a * b + (2^T - p) * q - r as integers, ignoring
        # any terms whose products are multiples of 2^T
        a_ints: FourTuple[ArithRef] = to_four_tuple([limb.value for limb in args.a])
        b_ints: FourTuple[ArithRef] = to_four_tuple([limb.value for limb in args.b])
        neg_p_ints: FourTuple[ArithRef] = to_four_tuple(
            [IntVal(limb, ctx=self.ctx().z3_ctx) for limb in args.neg_modulus_limbs]
        )
        q_ints: FourTuple[ArithRef] = to_four_tuple([limb.value for limb in args.q])
        r_ints: FourTuple[ArithRef] = to_four_tuple(
            [signed_field_to_int(limb.value) for limb in args.r]
        )

        lo_lhs, hi_lhs = multiply_mod_two_to_T(a_ints, b_ints)
        lo_p_neg_q, hi_p_neg_q = multiply_mod_two_to_T(q_ints, neg_p_ints)
        lo_neg_rhs = lo_p_neg_q - r_ints[0] - r_ints[1] * 2**bigfield.L
        hi_neg_rhs = hi_p_neg_q - r_ints[2] - r_ints[3] * 2**bigfield.L

        lo: ArithRef = lo_lhs + lo_neg_rhs
        hi: ArithRef = hi_lhs + hi_neg_rhs

        return (lo, hi)

    def lemmas(self) -> List[BoolRef]:
        args = self.witness
        a = [limb.value for limb in args.a]
        b = [limb.value for limb in args.b]
        r = [signed_field_to_int(limb.value) for limb in args.r]
        q = [limb.value for limb in args.q]
        neg_p = args.neg_modulus_limbs

        lo_0 = self.lo_0.value
        lo_1 = self.lo_1.value
        hi_0 = self.hi_0.value
        hi_1 = self.hi_1.value
        hi_2 = self.hi_2.value
        hi_3 = self.hi_3.value

        BITS = bigfield.PROHIBITED_LIMB_BITS
        L = bigfield.L
        n = bigfield.n

        half_n = (n - 1) // 2

        # (-n/2, n/2)
        def int_is_in_half_range(x: ArithRef):
            return And(-half_n <= x, x <= half_n)

        # [0, half_n] \\cup [half_n, n-1]
        native_half_range = NativeClosedInterval(lower=-half_n, upper=half_n)

        lo_0_rhs = a[0] * b[0] - r[0] + (a[1] * b[0] + a[0] * b[1]) * 2**L
        lo_0_correct = And(
            lo_0 % n == lo_0_rhs % n,
            native_half_range.includes(lo_0),
            int_is_in_half_range(lo_0_rhs),
            signed_field_to_int(lo_0) == lo_0_rhs,
        )
        lo_0_range = NativeClosedInterval(
            lower=-(2 ** (bigfield.k + BITS)),
            upper=2 ** (2 * BITS) + 2 ** (2 * BITS + 1 + L) + 2 ** (bigfield.k + BITS),
        )
        lo_0_bounded = lo_0_range.includes(lo_0)

        lo_1_rhs = (
            signed_field_to_int(lo_0)
            + q[0] * neg_p[0]
            + (q[1] * neg_p[0] + q[0] * neg_p[1] - r[1]) * 2**L
        )
        lo_1_correct = And(
            signed_field_to_int(lo_1) * 2 ** (2 * L) % n == lo_1_rhs % n,
            int_is_in_half_range(signed_field_to_int(lo_1) * 2 ** (2 * L)),
            int_is_in_half_range(lo_1_rhs),
            signed_field_to_int(lo_1) * 2 ** (2 * L) == lo_1_rhs,
        )
        # We have to assume the callers are range-checking lo_1!
        # We can't prove it directly
        lo_1_range = NativeClosedInterval(
            lower=-(2**L),
            upper=2**L,
        )
        lo_1_bounded_assumption = lo_1_range.includes(lo_1)

        hi_0_rhs = a[2] * b[0] + a[0] * b[2] + (a[0] * b[3] + a[3] * b[0] - r[3]) * 2**L
        hi_0_correct = And(
            hi_0 % n == hi_0_rhs % n,
            int_is_in_half_range(hi_0_rhs),
            signed_field_to_int(hi_0) == hi_0_rhs,
        )
        hi_0_range = NativeClosedInterval(
            lower=-(2 ** (bigfield.k + BITS + L)),
            upper=2 ** (2 * BITS + 1)
            + 2 ** (2 * BITS + 1 + L)
            + 2 ** (bigfield.k + BITS + L),
        )
        hi_0_bounded = hi_0_range.includes(hi_0)

        hi_1_rhs = (
            signed_field_to_int(hi_0)
            + a[1] * b[1]
            - r[2]
            + (a[1] * b[2] + a[2] * b[1]) * 2**L
        )
        hi_1_correct = And(
            hi_1 % n == hi_1_rhs % n,
            int_is_in_half_range(hi_1_rhs),
            signed_field_to_int(hi_1) == hi_1_rhs,
        )
        hi_1_range = NativeClosedInterval(
            lower=hi_0_range.lower - 2 ** (bigfield.k + BITS),
            upper=hi_0_range.upper
            + 2 ** (2 * BITS)
            + 2 ** (2 * BITS + 2 + L)
            + 2 ** (bigfield.k + BITS),
        )
        hi_1_bounded = hi_1_range.includes(hi_1)

        hi_2_rhs = (
            signed_field_to_int(hi_1)
            + signed_field_to_int(lo_1)
            + q[2] * neg_p[0]
            + (q[3] * neg_p[0] + q[2] * neg_p[1]) * 2**L
        )
        hi_2_correct = And(
            hi_2 % n == hi_2_rhs % n,
            int_is_in_half_range(hi_2_rhs),
            signed_field_to_int(hi_2) == hi_2_rhs,
        )
        hi_2_range = NativeClosedInterval(
            lower=hi_1_range.lower + lo_1_range.lower,
            upper=hi_1_range.upper
            + lo_1_range.upper
            + 2 ** (2 * BITS)
            + 2 ** (2 * BITS + 1 + L),
        )
        hi_2_bounded = Implies(lo_1_bounded_assumption, hi_2_range.includes(hi_2))

        hi_3_range = NativeClosedInterval(
            lower=0,
            upper=2**L - 1,
        )
        hi_3_rhs = (
            signed_field_to_int(hi_2)
            + (q[0] * neg_p[3] + q[1] * neg_p[2]) * 2**L
            + (q[0] * neg_p[2] + q[1] * neg_p[1])
        )
        hi_3_lhs = signed_field_to_int(hi_3) * 2 ** (2 * L)

        hi_3_helpers = And(
            hi_3_lhs % n == hi_3_rhs % n,
            int_is_in_half_range(hi_3_lhs),
            int_is_in_half_range(hi_3_rhs),
            # For some reason, we have to make this really explicit for Z3,
            If(
                hi_3_lhs - hi_3_rhs < 0,
                And(0 <= hi_3_rhs - hi_3_lhs, hi_3_rhs - hi_3_lhs < n),
                And(0 <= hi_3_lhs - hi_3_rhs, hi_3_lhs - hi_3_rhs < n),
            ),
            If(
                hi_3_lhs - hi_3_rhs < 0,
                (hi_3_rhs - hi_3_lhs) % n == 0,
                (hi_3_lhs - hi_3_rhs) % n == 0,
            ),
        )
        hi_3_correct = And(hi_3_helpers, Implies(hi_3_helpers, hi_3_lhs == hi_3_rhs))

        # We also need the caller to range-check hi 3!
        hi_3_bounded_assumption = hi_3_range.includes(hi_3)
        range_checks = And([lo_1_bounded_assumption, hi_3_bounded_assumption])

        # Finally, we want to show to have as a lemma that (lo, hi) actually decompose
        # hi3
        lo, hi = self._get_lo_hi()

        lo_matches_lo_1 = lo == signed_field_to_int(lo_1) * 2 ** (2 * L)
        lo_hi_matches_hi3 = lo + 2 ** (2 * L) * hi == signed_field_to_int(hi_3) * 2 ** (
            4 * L
        )

        return [
            lo_0_bounded,
            lo_0_correct,
            Implies(range_checks, lo_1_correct),
            Implies(range_checks, lo_matches_lo_1),
            hi_0_bounded,
            hi_0_correct,
            hi_1_bounded,
            hi_1_correct,
            hi_2_bounded,
            Implies(range_checks, hi_2_correct),
            Implies(range_checks, hi_3_correct),
            Implies(range_checks, lo_hi_matches_hi3),
        ]

    def _default_tactics(self):
        z3_ctx = self.ctx().z3_ctx
        tactic = z3.Then(
            "propagate-values",
            "euf-completion",
            "ctx-solver-simplify",
            "propagate-values",
            "smt",
            ctx=z3_ctx,
        )
        return tactic

    def postcondition(self) -> List[BoolRef]:
        args = self.witness

        lo, hi = self._get_lo_hi()
        total: ArithRef = lo + 2 ** (2 * bigfield.L) * hi

        # TODO: UNCOMMENT
        borrow_lo = NativeFieldElement(
            value=IntVal(2 ** (bigfield.L), ctx=self.ctx().z3_ctx)
        )
        # We can only say something if the caller range-checks the results
        assumed_range_checks = And(
            [
                args.return_value_lo + borrow_lo < 2 ** (bigfield.L + 1),
                args.return_value_hi < 2 ** (bigfield.L),
            ]
        )

        # After this circuit runs, if someone performs the range checks
        # then we should be able to conclude that total is 0 modulo 2^T
        postconditions: List[BoolRef] = []
        postconditions.append(Implies(assumed_range_checks, total % 2**bigfield.T == 0))

        return postconditions
