# Aztec Protocol Circuits

## A Comprehensive Guide to Kernel and Rollup Circuits

---

**Version:** 1.1.0

**Date:** January 28, 2026

**Repository:** `aztec-packages` (commit `6146044`)

---

**Abstract:**

This book provides an in-depth explanation of the Aztec protocol's
circuit architecture. Aztec is a privacy-first Layer 2 on Ethereum
that supports smart contracts with both private and public state.
The protocol achieves privacy through zero-knowledge proofs generated
by a hierarchy of circuits that process transactions from individual
function calls up to epoch-level proofs submitted to Ethereum.

The book starts with high-level concepts and progressively dives
deeper into the technical implementation. By the end, readers will
understand:

- How private execution works on user devices
- How public execution works via the Aztec Virtual Machine
- How the kernel circuits validate and accumulate transaction data
- How the rollup circuits compress many transactions into one proof
- How state is managed across multiple Merkle trees
- How data availability is achieved through blob commitments

---

**How to Read This Book**

This book is designed to be read progressively, with each chapter
building on previous ones.

**If you're new to blockchain/ZK:**
- Start with Chapter 1 (Introduction) - it explains ZKPs, notes, and nullifiers
- Read Chapter 2 (Architecture) carefully - it covers L2 basics
- Take your time with early chapters before moving to rollup circuits

**If you're familiar with Ethereum but new to ZK rollups:**
- Skim Chapter 1, focus on the notes/nullifiers section
- Chapter 3 (Transaction Lifecycle) gives a good end-to-end picture
- Chapters 4-6 explain private execution in detail

**If you're an experienced ZK developer:**
- Jump to Chapter 5 (Composer/Validator) for the architectural pattern
- Chapters 9-12 cover rollup circuits in technical depth
- Chapter 15 (Topology) gives the complete circuit relationship map

**If you're auditing the code:**
- Chapter 5 (Composer/Validator) explains where security-critical code lives
- Chapter 15 (Topology) maps circuits to verification keys
- Chapter 16 (Constants) lists all protocol limits

---

**Table of Contents**

1. Introduction to Aztec
2. High-Level Architecture
2a. Protocol Contracts
3. Transaction Lifecycle
4. Private Kernel Circuits
4a. The App-to-Kernel Interface
5. The Composer and Validator Pattern
6. Accumulated Data Flow
7. Public Execution and the AVM
8. Hiding Kernels
9. Transaction-Level Rollup Circuits
10. Block-Level Rollup Circuits
11. Checkpoint-Level Rollup Circuits
12. Epoch-Level Rollup Circuits
13. State Trees
14. Data Availability and Blobs
15. Circuit Topology and Proof Aggregation
16. Protocol Constants and Limits
17. Appendix: Glossary and References
18. Auditor's Guide to Protocol Circuits

---

**Version History**

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-01-28 | Added Protocol Contracts chapter (2a) |
| | | Updated domain separators for commit 6146044 |
| | | DOM_SEP__OUTER_NULLIFIER -> DOM_SEP__SILOED_NULLIFIER |
| | | Added new separators: PUBLIC_STORAGE_MAP_SLOT, etc. |
| 1.0.1 | 2026-01-27 | Fixed PDF overflow issues |
| | | Narrowed ASCII diagrams to fit page width |
| | | Fixed syntax highlighting (noir -> rust) |
| 1.0.0 | 2026-01-27 | Initial release |
| | | 19 chapters covering kernel and rollup circuits |
| | | Added App-to-Kernel Interface chapter (4a) |
| | | Added Auditor's Guide with code examples |
| | | Beginner-friendly explanations added |

---

\newpage
