from __future__ import annotations

from dataclasses import dataclass
from typing import List

from z3 import ArithRef, BoolRef

from field_emulation_proofs.solver_context import SolverContext

# BN254 scalar field prime
n = 21888242871839275222246405745257275088548364400416034343698204186575808495617


@dataclass
class NativeFieldElement:
    """An element in Aztec's native proving field"""

    modulus = n
    """modulus of the field"""

    value: ArithRef
    """The canonical representative of this native field element"""

    @classmethod
    def fresh(cls, name: str, ctx: SolverContext) -> "NativeFieldElement":
        """Create a fresh NativeFieldElement with none of its invariants enforced"""
        return NativeFieldElement(value=ctx.fresh_int(name))

    def invariants(self) -> List[BoolRef]:
        """Return the invariants expected to hold for this type"""
        if isinstance(self.value, int):
            return []
        return [self.value >= 0, self.value < self.modulus]

    def __add__(self, other: "NativeFieldElement" | int) -> "NativeFieldElement":
        other_val = self._assert_other_valid_and_unpack(other)

        return NativeFieldElement((self.value + other_val) % self.modulus)

    def __radd__(self, other: "NativeFieldElement" | int) -> "NativeFieldElement":
        return self.__add__(other)

    def __sub__(self, other: "NativeFieldElement" | int) -> "NativeFieldElement":
        other_val = self._assert_other_valid_and_unpack(other)

        return NativeFieldElement((self.value - other_val) % self.modulus)

    def __mul__(self, other: "NativeFieldElement" | int) -> "NativeFieldElement":
        other_val = self._assert_other_valid_and_unpack(other)

        return NativeFieldElement((self.value * other_val) % self.modulus)

    def __neg__(self):
        return NativeFieldElement(self.modulus - self.value)

    def eq_mod_native(self, other: "NativeFieldElement" | int) -> BoolRef:
        """Check equality"""
        # Note we don't override __eq__ since otherwise we get a type error
        # for not returning a bool :(
        other_val = self._assert_other_valid_and_unpack(other)

        # Since we require values to be reduced modulo the modulus, we could just
        # check integer equality. However, this feels safer and should be equivalent
        return self.value % self.modulus == other_val % self.modulus

    def __lt__(self, other: NativeFieldElement | int) -> BoolRef:
        other_val = self._assert_other_valid_and_unpack(other)

        return self.value % self.modulus < other_val % self.modulus

    def __le__(self, other: NativeFieldElement | int) -> BoolRef:
        other_val = self._assert_other_valid_and_unpack(other)

        return self.value % self.modulus <= other_val % self.modulus

    def __gt__(self, other: NativeFieldElement | int) -> BoolRef:
        other_val = self._assert_other_valid_and_unpack(other)

        return self.value % self.modulus > other_val % self.modulus

    def __ge__(self, other: "NativeFieldElement" | int) -> BoolRef:
        other_val = self._assert_other_valid_and_unpack(other)

        return self.value % self.modulus >= other_val % self.modulus

    def _assert_other_valid_and_unpack(
        self, int_or_field: int | NativeFieldElement
    ) -> ArithRef | int:
        """
        Ensure that constant integers are in the range [0, n)
        Ensure variable native field-elements are from the same field (i.e. have the same
        modulus)

        Returns the underlying value for the native field element, or just the integer if already a constant
        """
        if isinstance(int_or_field, int):
            assert int_or_field >= 0
            assert int_or_field < self.modulus
            return int_or_field
        else:
            assert isinstance(int_or_field, NativeFieldElement)
            assert int_or_field.modulus == self.modulus
            return int_or_field.value
