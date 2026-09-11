from dataclasses import dataclass, field
from typing import Set

from z3 import ArithRef, Bool, BoolRef, Context, Int


@dataclass
class SolverContext:
    """Context for the SMT-solver along with name registry to avoid
    collisions
    """

    z3_ctx: Context
    names: Set[str] = field(default_factory=set)

    def _get_fresh_name(self, name: str) -> str:
        base_name = name
        ctr = 0
        while name in self.names:
            name = f"{base_name}_{ctr}"
            ctr += 1
        self.names.add(name)
        return name

    def fresh_bool(self, name: str) -> BoolRef:
        """Get a fresh bool with the given name

        Adds a suffix if necessary to ensure uniqueness
        """
        name = self._get_fresh_name(name)
        return Bool(name, ctx=self.z3_ctx)

    def fresh_int(self, name: str) -> ArithRef:
        """Get a fresh int with the given name

        Adds a suffix if necessary to ensure uniqueness
        """
        name = self._get_fresh_name(name)
        return Int(name, ctx=self.z3_ctx)
