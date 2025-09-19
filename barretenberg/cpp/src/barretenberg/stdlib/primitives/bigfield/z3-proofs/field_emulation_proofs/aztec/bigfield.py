from dataclasses import dataclass
from math import floor, gcd, log2
from typing import List

from z3 import And, ArithRef, BoolRef, Implies, Int

from field_emulation_proofs.aztec.native_field import NativeFieldElement, n
from field_emulation_proofs.solver_context import SolverContext

# Parameters
# BN254 base field prime
p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
num_limbs = 4
L = 68
k = 10
Q = floor((log2(n) - L - k - 3) / 2)
MAX_UNREDUCED_LIMB_BITS = L + k
PROHIBITED_LIMB_BITS = MAX_UNREDUCED_LIMB_BITS + 5
T = num_limbs * L
M = 2**T * n

# Sanity checks
assert L <= MAX_UNREDUCED_LIMB_BITS
assert MAX_UNREDUCED_LIMB_BITS <= PROHIBITED_LIMB_BITS
assert PROHIBITED_LIMB_BITS < Q
assert Q == 86


def property_crt_specialized(
    a: ArithRef, modulus_1: int = n, modulus_2: int = 2**T
) -> BoolRef:
    assert gcd(modulus_1, modulus_2) == 1
    assert modulus_1 > 1
    assert modulus_2 > 1

    alternative = Int(f"_{str(a)}_alt_CRT", ctx=a.ctx)
    constraints = []

    constraints.append(alternative % modulus_1 == a % modulus_1)
    constraints.append(alternative % modulus_2 == a % modulus_2)
    for var in [alternative, a]:
        constraints.append(0 <= var)
        constraints.append(var < modulus_1 * modulus_2)

    return Implies(And(constraints), a == alternative)


@dataclass
class Bigfield:
    """A symbolic element in the bigfield"""

    var: ArithRef
    """An integer equivalent to the bigfield represented by this object

    This is a 'ghost variable,' it does not actually exist in the code
    """

    limbs: List[NativeFieldElement]
    """2^L-Limbs representing var % 2^T"""

    prime_limb: NativeFieldElement
    """var % n"""

    def invariants(self) -> List[BoolRef]:
        """Return the invariants which should be maintained on this object

        Returns:
            List[BoolRef]: The list of invariants
        """
        constraints = []

        # Range of each limb
        constraints.append(self.var >= 0)
        constraints.append(self.var < M)
        for limb in self.limbs:
            constraints.append(0 <= limb)
            constraints.append(limb < 2**PROHIBITED_LIMB_BITS)
        # var is defined by limb-sum and prime-limb
        limb_sum: ArithRef = self.limb_sum()
        constraints.append(limb_sum % (2**T) == self.var % (2**T))
        constraints.append(self.prime_limb.value % n == self.var % n)

        # Initially, limb_sum must match prime limb
        constraints.append(self.prime_limb.value % n == limb_sum % n)

        # Add native field elt invariants
        for native_field_elt in [self.prime_limb] + self.limbs:
            constraints += native_field_elt.invariants()

        return constraints

    @classmethod
    def fresh(cls, name: str, ctx: SolverContext) -> "Bigfield":
        """
        Create a fresh Bigfield variable without any constraints
        """
        var = ctx.fresh_int(name)
        limbs = [
            NativeFieldElement.fresh(f"{name}_{i}", ctx=ctx) for i in range(num_limbs)
        ]
        prime_limb = NativeFieldElement.fresh(f"{name}_prime", ctx=ctx)

        # Declare variables
        element = Bigfield(var=var, limbs=limbs, prime_limb=prime_limb)
        return element

    def limb_sum(self) -> ArithRef:
        """Weighted sum of binary limbs (interpreted as integers)"""
        return sum([limb.value * 2 ** (i * L) for i, limb in enumerate(self.limbs)])

    def property_representation_is_valid(self) -> List[BoolRef]:
        """The limbs fully encode ``var``"""

        constraints = []
        limb_sum = self.limb_sum()
        constraints.append(limb_sum < M)
        constraints.append(limb_sum % M == self.var % M)
        constraints.append(limb_sum == self.var)
        return constraints

    def property_limb_sum_bounds_var(self) -> List[BoolRef]:
        """
        The property that the (weighted) sum of the binary limbs is an upper bound
        on the represented value
        """
        return [self.var <= self.limb_sum()]

    def properties_implied_by_invariants(self) -> List[BoolRef]:
        """Return all properties which should be implied by the bigfield invariants

        Returns:
            List[BoolRef]: The list of properties
        """
        return (
            self.property_representation_is_valid()
            + self.property_limb_sum_bounds_var()
        )
