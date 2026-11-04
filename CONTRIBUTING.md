# Contributing Guidelines

These guidelines apply to aztec-packages (barretenberg, noir-projects/fnd, l1-contracts, avm-transpiler). For the node, client and aztec-nr, see [aztec-labs-eng/aztec-node](https://github.com/aztec-labs-eng/aztec-node).

Report security vulnerabilities as described in [SECURITY.md](./SECURITY.md), not in a public issue.

Please read our [disclaimer](./DISCLAIMER.md) first

## Opening an issue

You can [open an issue] to suggest a feature or report a minor bug.

Before opening an issue, be sure to search through the existing open and closed issues, and consider posting a comment in one of those instead.

When requesting a new feature, include as many details as you can, especially around the use cases that motivate it. Features are prioritized according to the impact they may have on the ecosystem, so we appreciate information showing that the impact could be high.

[open an issue]: https://github.com/AztecProtocol/aztec-packages/issues/new

## Submitting a pull request

A contribution that addresses a real issue and is well-structured is welcome. To contribute code or documentation, fork the repository and open a pull request against `next`. For non-trivial changes, open an issue and discuss it with maintainers first (see [Opening an issue](#opening-an-issue)).

PR titles must follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `chore:`, ...); CI checks this.

We may block users who repeatedly submit low-effort or trivial content (for example metric-farming or AI-generated submissions). We may also block users who disrupt the team, for example by repeatedly demanding attention on GitHub or elsewhere. We generally redo low-effort submissions ourselves to discourage metric farming.

If you're looking for a good place to start, look for issues labeled ["good first issue"](https://github.com/AztecProtocol/aztec-packages/labels/good%20first%20issue). Please first communicate that you wish to take it on.

## Pull request checklist:

- I've provided a paragraph or two giving a summary of the change in the description, including relevant motivation and context.
- I've enabled auto-merge if the PR is ready to merge (this adds the PR to the merge queue).
- I have reviewed my diff in GitHub, line by line and removed unexpected formatting changes, testing logs, or commented-out code.
- Every change is related to the PR description.
- I have [linked](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue) this pull request to relevant issues (if any exist).
