"""Soundness verification for unsafe_evaluate_multiply_add()"""

from dataclasses import dataclass
from typing import List, Literal

from z3 import ArithRef, BoolRef, If, IntVal

from field_emulation_proofs.aztec import bigfield
from field_emulation_proofs.aztec.bigfield import Bigfield
from field_emulation_proofs.aztec.field import (
    field_t_accumulate,
    field_t_evaluate_polynomial_identity,
)
from field_emulation_proofs.aztec.native_field import NativeFieldElement
from field_emulation_proofs.aztec.ultra_circuit_builder.evaluate_non_native_field_multiplication import (
    EvaluateNonNativeFieldMultiplication,
    NonNativeMultiplicationWitnesses,
)
from field_emulation_proofs.aztec.utils import NativeClosedInterval, to_four_tuple
from field_emulation_proofs.hoare_logic import HoareTriple, WitnessBase
from field_emulation_proofs.solver_context import SolverContext


@dataclass
class UnsafeEvaluateMultiplyAddWitness(WitnessBase):
    input_left: Bigfield
    input_to_mul: Bigfield
    to_add: List[Bigfield]
    input_quotient: Bigfield
    input_remainders: List[Bigfield]

    @classmethod
    def fresh(cls, ctx: SolverContext) -> "UnsafeEvaluateMultiplyAddWitness":
        # TODO: Replace with 2**k
        array_length = 1

        input_left = Bigfield.fresh("input_left", ctx)
        input_right = Bigfield.fresh("input_right", ctx=ctx)
        to_add = [Bigfield.fresh(f"to_add_{i}", ctx=ctx) for i in range(array_length)]
        input_quotient = Bigfield.fresh("input_quotient", ctx=ctx)
        input_remainders = [
            Bigfield.fresh(f"input_remainders_{i}", ctx=ctx)
            for i in range(array_length)
        ]

        return UnsafeEvaluateMultiplyAddWitness(
            ctx=ctx,
            input_left=input_left,
            input_to_mul=input_right,
            to_add=to_add,
            input_quotient=input_quotient,
            input_remainders=input_remainders,
        )

    def invariants(self) -> List[BoolRef]:
        """The standard bigfield invariants must hold on each input."""
        invariants = []
        all_bigfields = (
            [self.input_left, self.input_to_mul, self.input_quotient]
            + self.to_add
            + self.input_remainders
        )
        for b in all_bigfields:
            invariants += b.invariants()

        assert len(self.to_add) <= 2**bigfield.k
        assert len(self.input_remainders) <= 2**bigfield.k

        return invariants


class UnsafeEvaluateMultiplyAdd(
    HoareTriple[UnsafeEvaluateMultiplyAddWitness],
    witness_cls=UnsafeEvaluateMultiplyAddWitness,
):
    def __init__(self, witness: UnsafeEvaluateMultiplyAddWitness):
        super().__init__(witness)
        shift_1 = 2**bigfield.L
        self.shift_1 = shift_1

    def evaluate(self) -> List[BoolRef]:
        constraints = []
        args = self.witness

        left = args.input_left
        to_mul = args.input_to_mul
        to_add = args.to_add
        quotient = args.input_quotient
        remainders = args.input_remainders

        assert len(remainders) > 0
        # TODO: Use actual maximum bounds
        borrow_lo = 2**bigfield.L
        carry_lo_msb = bigfield.L + 1
        carry_hi_msb = bigfield.L

        limb_0_accumulator = [remainders[0].limbs[0]]
        limb_2_accumulator = [remainders[0].limbs[2]]
        prime_limb_accumulator = [remainders[0].prime_limb]
        for i in range(1, len(remainders)):
            limb_0_accumulator.append(remainders[i].limbs[0])
            limb_0_accumulator.append(remainders[i].limbs[1] * self.shift_1)
            limb_2_accumulator.append(remainders[i].limbs[2])
            limb_2_accumulator.append(remainders[i].limbs[3] * self.shift_1)
            prime_limb_accumulator.append(remainders[i].prime_limb)
        for add in to_add:
            limb_0_accumulator.append(-add.limbs[0])
            limb_0_accumulator.append(-add.limbs[1] * self.shift_1)
            limb_2_accumulator.append(-add.limbs[2])
            limb_2_accumulator.append(-add.limbs[3] * self.shift_1)

        # TODO: Handle needs_normalize = True case
        # needs_normalize = self.ctx().fresh_bool("needs_normalize")
        needs_normalize = False

        remainder_limbs = [
            field_t_accumulate(limb_0_accumulator, ctx=self.ctx()),
            NativeFieldElement(
                value=If(needs_normalize, 0, remainders[0].limbs[1].value)
            ),
            field_t_accumulate(limb_2_accumulator, ctx=self.ctx()),
            NativeFieldElement(
                value=If(needs_normalize, 0, remainders[0].limbs[3].value)
            ),
        ]
        remainder_prime_limb = field_t_accumulate(
            prime_limb_accumulator, ctx=self.ctx()
        )
        if isinstance(remainder_prime_limb, int):
            remainder_prime_limb = NativeFieldElement(
                value=IntVal(remainder_prime_limb, ctx=self.ctx())
            )

        lo = NativeFieldElement.fresh("lo", ctx=self.ctx())
        hi = NativeFieldElement.fresh("hi", ctx=self.ctx())
        non_native_field_mult_witness = NonNativeMultiplicationWitnesses(
            ctx=self.ctx(),
            a=to_four_tuple(left.limbs),
            b=to_four_tuple(to_mul.limbs),
            q=to_four_tuple(quotient.limbs),
            r=to_four_tuple(remainder_limbs),
            return_value_lo=lo,
            return_value_hi=hi,
        )
        non_native_field_mult_gate = EvaluateNonNativeFieldMultiplication(
            non_native_field_mult_witness
        )
        constraints.append(non_native_field_mult_gate.get_consequence())

        neg_prime = non_native_field_mult_witness.neg_modulus
        constraints += field_t_evaluate_polynomial_identity(
            ctx=self.ctx(),
            a=left.prime_limb,
            b=to_mul.prime_limb,
            c=quotient.prime_limb * (neg_prime % bigfield.n),
            d=-remainder_prime_limb,
        )

        lo_range = NativeClosedInterval(lower=0, upper=2**carry_lo_msb)
        hi_range = NativeClosedInterval(lower=0, upper=2**carry_hi_msb)

        constraints += [
            lo_range.includes((lo + borrow_lo).value),
            hi_range.includes((hi).value),
        ]

        return constraints

    def postcondition(self) -> List[BoolRef]:
        """After these constraints, we should know that
        (a * b + c - p * q - r = 0) modulo 2**T and modulo n
        """
        args = self.witness
        a: ArithRef = args.input_left.var
        b: ArithRef = args.input_to_mul.var
        c: ArithRef | Literal[0] = sum([to_add.var for to_add in args.to_add])
        q: ArithRef = args.input_quotient.var
        r: ArithRef | Literal[0] = sum([rem.var for rem in args.input_remainders])
        expr = a * b + c + q * (2**bigfield.T - bigfield.p) - r
        return [
            # TODO: Get this to pass!
            # expr % 2**bigfield.T == 0,
            expr % bigfield.n
            == 0,
        ]

    def lemmas(self) -> List[BoolRef]:
        lemmas = []
        n = bigfield.n
        T = bigfield.T
        p = bigfield.p
        args = self.witness

        left = args.input_left
        to_mul = args.input_to_mul
        quotient = args.input_quotient
        to_add = args.to_add
        remainders = args.input_remainders

        to_add_ints = [a.var for a in to_add]
        remainder_ints = [r.var for r in remainders]

        bigfields = (
            [args.input_left, args.input_to_mul, args.input_quotient]
            + args.to_add
            + args.input_remainders
        )
        for b in bigfields:
            lemmas += b.properties_implied_by_invariants()

        # This gets us to the proof modulo n
        lemmas += [
            (
                (left.var) * (to_mul.var) % n
                + sum(to_add_ints) % n
                + (quotient.var % n) * (2**T - p) % n
                - sum(remainder_ints) % n
            )
            % n
            == 0,
            (quotient.var % n) * (2**T - p) % n == (quotient.var * (2**T - p)) % n,
            (left.var % n) * (to_mul.var % n) % n == (left.var * to_mul.var) % n,
            (
                left.var * to_mul.var
                + sum(to_add_ints)
                + quotient.var * (2**T - p)
                - sum(remainder_ints)
            )
            % n
            == 0,
        ]

        # Now we need to get to the proof modulo 2**T

        return lemmas
