"""Common utilities for test suites."""

from __future__ import annotations

import pytest
import z3

from field_emulation_proofs.solver_context import SolverContext

DEFAULT_TIMEOUT_MS: int = 10_000
DEFAULT_SEED: int = 8675309


def solver_factory(
    ctx: SolverContext, timeout_ms: int = DEFAULT_TIMEOUT_MS
) -> z3.Solver:
    """Create a solver configured with deterministic settings."""
    solver = z3.Solver(ctx=ctx.z3_ctx)
    solver.set("timeout", timeout_ms)
    solver.set("random_seed", DEFAULT_SEED)
    solver.set("threads", 1)
    z3.set_param("parallel.enable", False)
    return solver


@pytest.fixture
def solver_ctx() -> SolverContext:
    """Return a :class:`SolverContext` with a fresh underlying ``z3.Context``."""
    z3_ctx = z3.Context()
    return SolverContext(z3_ctx=z3_ctx)
