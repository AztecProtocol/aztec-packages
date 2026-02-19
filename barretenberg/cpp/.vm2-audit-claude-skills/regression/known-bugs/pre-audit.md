# Tasks/Checklist

# Checklist \- Audit

Note: TS simulator is out of scope

Highlight color for removal candidates.

# One-Time Tasks

* **\[TODO\_REMOVAL\]** Remove any TODO or reformulate with other keywords: Improvement:, etc, …  
* **\[PIL\_FORMAT\]** PIL unified format  
* **\[PIL\_CONSTANTS\]** If we cannot introduce constants in lookup columns, it might be worth to introduce precomputed columns for these constants as to minimize the total number of columns and relations.  
* **\[DOCU\_FUNCTIONS\]** For each function/method, we use doxygen annotation.  
  * Add a brief description and document all inputs and the output.  
  * Document the different exceptions that might be thrown. In the presence of several error cases, their order (possibly mapping to temporality groups) is specified as well.  
  * Mention the preconditions and/or assertions.

  The scope is the functions which are not part of a component. This task appears in per component tasks as well.

* **\[CORE\_INFRA\]** Code review for critical lib such as interaction builders:  
  * Permutation builder (See also this [issue](https://github.com/AztecProtocol/aztec-packages/issues/15115))  
  * Lookup counts  
  * Fine-grained lookup selectors  
  * Multi-permutations  
* **\[PIL\_SANITY\_1\]** Presence of each declared column in at least a relation or interaction  
* **\[ASSERTIONS\]** TBD: Decide on BB-ASSERT vs standard assert()  
* **\[LINTER\_WARNINGS\]:** TBD: Ignore, whitelist, correct?  
* **\[CPP\_HEADERS\]:** Check the list of cpp header imports (In cursor hovering the include displays if any symbol is used.)  
  * Keep only imports that are required. (especially in .hpp file)  
  * Add imports which are missing (hard to be comprehensive though) because they are transitively added (except for own header file)  
  * Remove redundant imports from .cpp which are required in the counterpart header file. E.g., if alu.hpp includes \<cstdint\>, alu.cpp does not need to re-include it.

  The scope is the functions which are not part of a component. This task appears in per component tasks as well.


# Per-Component Tasks

## Witgen Simulation

* **\[DOCU\_FUNCTIONS\]** See description in “One-Time Tasks” section.  
* **\[EVENT\_INIT\]** Emitted events must not have uninitialized members.  
  * Use default values in the event struct definition  
* **\[EMIT\_EXPLICIT\_EVENT\]:** Try to avoid building events incrementally. (might be hard in execution)  
* **\[INTERACTION\_EVENTS\]** Reason about each code flow path (different error cases which might be thrown) and consider any circuit interactions (lookups/perms) for which the component is the source. Check that for any code path the events for interactions are correctly emitted, i.e., both the source and destination events must be emitted. It is a completeness issue if the source or possibly destination was emitted without the other. In simulation, the source component is normally calling the destination (lookup) so that it is very unlikely that we emit the destination event without the source counterpart event.  
* **\[SANITY\_SOURCE\]** Source code sufficiently commented and clear. In addition:  
  * Ensure methods implementing the interface have the keyword “override”.  
  * Do not catch a generic runtime exception, but define specific ones. We do not want to catch the truly unexpected ones.  
* **\[CPP\_HEADERS\]:** See description in “One-Time Tasks” section.  
* **\[CHECK\_ISA\_SPEC\]:** Check that the ISA reference markdown document pertaining to the opcodes is correct. The list of the ISA is [here](https://github.com/AztecProtocol/aztec-packages/blob/next/yarn-project/simulator/docs/avm/avm-isa-quick-reference.md).  
* **\[UNIT\_TEST\]** Unit test coverage?

## Tracegen

* **\[DOCU\_FUNCTIONS\]** See description in “One-Time Tasks” section. For tracegen, additionally document the different flavors of events which are processed by a given processing routine. An event of a given class can be emitted at different times in simulation and/or under different error conditions leading to different event invariants (some fields being empty, different error enum value, etc …). This is what we mean by flavor.  
* **\[TYPE/RANGE\]** For each column element being constrained of a given type (e.g. boolean) check that we always set a value within the correct range. Be careful about ranges which should capture overflows (wider range might be needed).  
* **\[INTERACTION\_SRC\]** The source selector of an interaction is toggled iff the event must have been emitted. An event must contain information to allow toggling interactions when the interaction happens in simulation. The criteria (e.g., error enum) for toggling such selectors must be checked in accordance with the simulation and whether the destination event is emitted.  
* **\[SANITY\_SOURCE\]** Source code sufficiently commented and clear.   
  * The same column being overridden should be avoided. Whether there is a single occurrence of “setting a column” or the multiple occurrences must be clearly part of disjoint code paths (dispatching based on events flavours.)  
  * Check uniformity of Column keyword versus alias C  
* **\[CPP\_HEADERS\]:** See description in “One-Time Tasks” section.  
* **\[INTERACTIONS\_DECL\]**  
  * Check that each interaction is declared correctly in Builder and that the type of interaction is correct (Sequential, etc, …).  
    * For Sequential type, check that tracegen on both sides does not perform any sorting/re-ordering of the events (e.g., public\_data\_tree, ..). Also check simulation\_helper() and do not use LookupSequential if the target trace uses a deduplicating event emitter.  
    * For Indexed by row, double check that the first item in the looked up tuple is the row index.  
    * For custom lookup builders, make sure that the tuple follows the assumptions of the specific builder.  
  * Multi-permutation special case \- Check coarse and fine-grained selectors.  
  * Lookup with fine-grained selectors special case: Check coarse and fine grained selectors.

## Circuit

* **\[DOCU\_MAIN\]**   
  * Example/illustration when shape is not trivial. (Not a killer criteria.)	  
  * Explain the trace shape among different use cases. How many rows are required for a given event to process. Is it variable or fixed?  
  * List all errors and when they occur and the effect on the trace shape (stops at first row, etc, …)  
  * List preconditions that the gadget relies on (e.g., range check during write). For instance, range\_check assumes values bounded by 2^128  
  * List each component which appears as the destination of an interaction defined in this .pil file.   
* **\[DOCU\_INTERACTIONS\]** List the different proper usages of the component if it appears as a destination of a lookup/permutation.   
  * Be careful about specifying all tuple elements. (Forgetting a field is a typical footgun.)  
  * Check that the selectors are the right ones and be explicit if more than a selector can be chosen about the different usages.  
  * Specify what are the inputs and outputs (For some columns there might not be a clear answer.) when it is clear.  
* **\[DOCU\_INSIDE\]** Comments should be present for every non-trivial step or important properties. For instance, comment whenever a column is not constrained on every row and might be a footgun. For instance, toggling an error only at the first/last row of a latch. Comment “This column is underconstrained except in the first row.”  
* **\[HEADERS\_SANITY\].** Check that the import of .pil files are all required and avoid indirect import, i.e, do not rely on an imported .pil file to include another .pil file.  
* **\[TYPE/RANGE\]** Is each column correctly range-checked? e.g., boolean, …, When it is derived or checked elsewhere (precondition), please add a comment explaining this.  
* **\[COMMON\_PATTERNS\]** Common constraint unification/check:  
  * Boolean (Add a tag like @boolean)  
  * Zero-check (standard format and reference to hackmd? Or markdown docu?)  
  * OR computation  
  * Latch condition (naming and no extra latch in first row)  
  * Unified naming for multi-rows computation: last/start/end/latch/etc ….  
  * Trace continuity  
* **\[INTERACTIONS\_USE\]** For any interaction, verify that its usage corresponds to the documentation in the destination subtrace .pil file. If no usage is present, create one.  
  * Check that the correct selectors are used and that no tuple column is missing.  
  * Think about whether it should be a permutation vs lookups. For any destination trace with side-effects (e.g., memory), a permutation is normally a MUST to prevent extra malicious computations which would corrupt memory.  
* **\[COMPLETENESS\]** Check that each relation in the subtrace is an invariant of tracegen. In other words, for any codepath in tracegen, every relation must be satisfied.  
* **\[SKIPPABLE\]** Is the skippable condition correct and does tracegen comply with the skippable condition.  
* **\[POSITIVE\_TESTS\]** Positive Unit test coverage with tracegen routine for the different main code paths (one for each possible error) ?  
* **\[NEGATIVE\_TESTS\]**  Negative test (Soundness) ?  
* **\[SOUNDNESS\]** The relations must enforce the expected behavior/computation of the subtrace as specified by the specs.

TO BE DONE: CATEGORIZE BY PRIORITIES (FLAG later, etc… )

# Component List

# Component List

Note: PIL centric classifications (tracegen)

**Priority Scale:** High, Medium, Low  
**Effort:** Relative to GT (weight 1\)

| Component | Priority | Comments | Effort | DONE |
| ----- | :---: | ----- | ----- | ----- |
| Execution \- execution.pil | **High** | [Pre-Audit Report](#‘component_name’---pre-audit---report) | 15 |  |
| Execution \- addressing.pil | **High** | [Pre-Audit Report](https://docs.google.com/document/d/1NQhYS-95VdiCCRTUB_4FMZHK4RIKeL21kAE727nFNTI/edit?tab=t.612tqzwlsmji) | 6 |  |
| Execution \- registers.pil | **High** | [Pre-Audit Report](https://docs.google.com/document/d/1NQhYS-95VdiCCRTUB_4FMZHK4RIKeL21kAE727nFNTI/edit?tab=t.5qm1pwkx6zuv) | 3 |  |
| Execution \- gas.pil | **High** | [Pre-Audit Report](https://docs.google.com/document/d/1NQhYS-95VdiCCRTUB_4FMZHK4RIKeL21kAE727nFNTI/edit?tab=t.ndmn2trvpds3) | 2 |  |
| Execution \- context.pil | **High** | [Pre-Audit report](https://docs.google.com/document/d/1NQhYS-95VdiCCRTUB_4FMZHK4RIKeL21kAE727nFNTI/edit?pli=1&tab=t.qcu9i7sjxydq) | 11 |  |
| Execution \- discard.pil | **High** | [Pre-Audit Report]() | 4 |  |
| Execution \- internal\_call.pil | **High** | [Pre-Audit Report]() | 4 |  |
| Execution \- external\_call.pil | **High** | [Pre-Audit Report]() | 2 |  |
| Execution \- other opcodes | **Low** | emit\_notehash.pil, emit\_nulllifier.pil, send\_l2\_to\_l1\_msg.pil, get\_env\_var.pil, \*\*\*\_exists.pil sload/sstore.pil | 10 |  |
| Tx \- tx.pil \+ tx\_discard.pil | **High** |  [Pre-Audit report](#‘component_name’---pre-audit---report) | 10 |  |
| Tx \- tx\_context.pil | **High** |  | 8 |  |
| Bytecode \- bc\_decomp | **Medium** | [Pre-Audit report]() | 4 |  |
| Bytecode \- instr\_fetch | **Medium** |  | 4 |  |
| Bytecode \- bc\_hashing.pil | **Medium** |  | 4 |  |
| Bytecode \- bc\_retrieval.pil | **Medium** |  | 3 |  |
| Bytecode \- address\_deriv. | **Medium** |  | 3 |  |
| Bytecode \- class\_id\_deriv. | **Medium** |  | 2 |  |
| Bytecode \- contract\_inst\_retr. | **Medium** |  | 4 |  |
| Bytecode \- update\_check.pil | **Medium** |  | 3 |  |
| Tree \- merkle\_check.pil | **High** | [Pre-Audit report]() | 4 |  |
| Tree \- l1\_to\_l2\_msg\_check | **Medium** | [Pre-Audit report]() | 2 |  |
| Tree \- note\_hash\_tree\_check | **Medium** | [Pre-Audit report]() | 3 |  |
| Tree \- nullifier\_check.pil | **Medium** |  | 3 |  |
| Tree \- public\_data\_check.pil | **Medium** |  | 4 |  |
| Tree \-  public\_data\_squash | **Medium** |  | 3 |  |
| Tree \- retrieved\_bytecodes | **Medium** |  | 4 |  |
| Tree \- written\_public\_data\_sl | **Medium** |  | 3 |  |
| Memory | **Low** |  | 4 |  |
| Alu | **High** | [Pre-Audit report](#‘component_name’---pre-audit---report) | 8 |  |
| Bitwise | **Low** |  | 3 |  |
| Calldata | **Medium** | calldata.pil \+ calldata\_hashing.pil | 4 |  |
| Data Copy | **High** | [Pre-Audit Report]() | 4 |  |
| ECC | **Medium** | [Pre-Audit Report]() | 4 |  |
| GT | **Low** |  | 1 |  |
| FF\_GT | **Medium** | [Pre-Audit Report]() | 3 |  |
| Keccak | **Low** | keccak\_memory.pil \+ keccakf1600.pil | 8 |  |
| Poseidon2 | **High** | [Pre-Audit Report]() | 10 |  |
| Sha256 | **Low** | sha256.pil \+ sha256\_mem.pil | 10 |  |
| Precomputed | **Low** |  | 1 |  |
| Public Inputs | **Low** | Sanity check that each public input involved into a lookup/perm  | 2 |  |
| Range Check | **Low** |  | 3 |  |
| Scalar Mul | **Medium** | [Pre-Audit Report](https://docs.google.com/document/d/1NQhYS-95VdiCCRTUB_4FMZHK4RIKeL21kAE727nFNTI/edit?pli=1&tab=t.hjsk29i7xm98) | 4 |  |
| To Radix | **Medium** | [Pre-Audit Report]() | 5 |  |
| Emit Unencrypted Logs | **Medium** |  | 5 |  |
| Get Contract Instance Op. | **Medium** |  | 3 |  |

**Estimate of effort unit**: 1 engineer day \= 2-3 points

**Total Effort for components:** 210

**Effort for one-time tasks:** ca. 20

**Jean has 80 days work until February 14th.**

**Total number of lines in pil files:** 16219  
**Total number of lines in tracegen folder (without tests):** 10648

For 80 days: ⇒ 200 PIL lines and 130 cpp tracegen lines per day realistic?? (Seems tight)

# Template \- Pre-Audit

# ‘Component\_Name’ \- Pre-Audit \- Report {#‘component_name’---pre-audit---report}

Author: **Person**  
PR: \<Link to the relevant PR\>  
Pre-Audit Status: Not Started  
Following Tasks Status: Not started

Start Date: Date  
End Date: Date  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # List source code relevant files

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Not started |  |
| **EVENT\_INIT** | Not started |  |
| **EMIT\_EXPLICIT\_EVENT** | Not started |  |
| **INTERACTION\_EVENTS** | Not started |  |
| **SANITY\_SOURCE** | Not started |  |
| **CPP\_HEADER\_IMPORTS** | Not started |  |
| **CHECK\_ISA\_SPEC** | Not started |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Not started |  |
| **TYPE/RANGE** | Not started |  |
| **INTERACTION\_SRC** | Not started |  |
| **SANITY\_SOURCE** | Not started |  |
| **CPP\_HEADERS** | Not started |  |
| **INTERACTIONS\_DECL** | Not started |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Not started |  |
| **DOCU\_INTERACTIONS** | Not started |  |
| **DOCU\_INSIDE** | Not started |  |
| **HEADERS\_SANITY** | Not started |  |
| **TYPE/RANGE** | Not started |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Not started |  |
| **COMPLETENESS** | Not started |  |
| **SKIPPABLE** | Not started |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* 

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Add unit test XZY** | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# FF\_GT-Report

# FF\_GT \- Pre-Audit \- Report

Author: **[Facundo Carreiro](mailto:facundo@aztec-labs.com)**  
PR: [https://github.com/AztecProtocol/aztec-packages/pull/20442](https://github.com/AztecProtocol/aztec-packages/pull/20442)  
Pre-Audit Status: In Progress  
Following Tasks Status: Not started

Start Date: Jan 18, 2026  
End Date: Feb 12, 2026  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # [ff\_gt.pil](https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/cpp/pil/vm2/ff_gt.pil)

* [field\_gt\_trace.cpp](https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/cpp/src/barretenberg/vm2/tracegen/field_gt_trace.cpp)  
* [field\_gt.cpp](https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/cpp/src/barretenberg/vm2/simulation/gadgets/field_gt.cpp) (gadget)  
* [field\_gt\_event.hpp](https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/cpp/src/barretenberg/vm2/simulation/events/field_gt_event.hpp)  
* [field\_gt.test.cpp](https://github.com/AztecProtocol/aztec-packages/blob/next/barretenberg/cpp/src/barretenberg/vm2/constraining/relations/field_gt.test.cpp) (constraining tests)

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **CHECK\_ISA\_SPEC** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* 

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Add unit test XZY** | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# Gas-Report

# Gas \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#19077](https://github.com/AztecProtocol/aztec-packages/pull/19077)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Dec 16, 2025  
End Date: Dec 17, 2025  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # gas.hpp/cpp, gas\_tracker.hpp/cpp, gas\_event.hpp

* Tracegen (part of Execution report)  
* gas.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done | We keep it not explicit. gas\_event is passed to gas\_tracker. |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done | No interaction to gas.pil |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* 

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Add unit test XZY** | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# Registers-Report

# Registers \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#19027](https://github.com/AztecProtocol/aztec-packages/pull/19027)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Dec 15, 2025  
End Date: Dec 15, 2025  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Tracegen: part of execution report 

* # Circuit: registers.pil

# Check Lists

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done | This subtrace is not involved through interactions |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* 

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Add unit test XZY** | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# Discard-Report

# Discard \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#19149](https://github.com/AztecProtocol/aztec-packages/pull/19149)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Dec 17, 2025  
End Date: Dec 19, 2025  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Tracegen: part of execution report 

* # Circuit: discarding.pil

# Check Lists

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done | This subtrace is not involved through interactions |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done | No interaction used. |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* We noticed a regression performed as part of tx.pil pre-audit where the “end enqueued call” lookup was not passing discard field. It turned out that it was important for soundness of the whole discarding logic. A malicious prover could have discarded all rows happening before a failing nested call in the execution trace.

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Add unit test XZY** | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# External Call-Report

# External Call \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#19155](https://github.com/AztecProtocol/aztec-packages/pull/19155)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Dec 19, 2025  
End Date: Dec 19, 2025  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Simulation: part of execution report (gas\_tracker.cpp compute\_gas\_limit\_for\_call())

* # Tracegen: part of execution report

* # Circuit: external\_call.pil

# Check Lists

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done | This subtrace is not invoked through interactions |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* No security issues identified

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Add unit test XZY** | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# Addressing-Report

# Addressing \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#19001](https://github.com/AztecProtocol/aztec-packages/pull/19001)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Dec 10, 2025  
End Date: Dec 12, 2025  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Simulation: addressing.hpp/cpp, addressing\_event.hpp

* Tracegen: part of [Execution \- report](#tracegen)  
* Circuit: addressing.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done | We keep the incremental one here. |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done | No interaction to addressing.pil. |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* Completeness issue related to a mismatch behavior between simulation and circuit related to the error of an invalid base address. If we resolve first an indirect address and then a relative address with an invalid base address, the trace generation toggles the column `C::execution_sel_should_apply_indirection[0]` and `#[INDIRECT_GATING_0]` will fail.  
* Two other completeness issues found:  
  * In simulation, when a relative address overflows, we did not correctly set the default resolved operand.  
  * In tracegen, the boolean used to build the “batched diff resolved operand tag” was not the correct one.	

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Add unit test XZY** | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# Context-Report

# Context \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#19549](https://github.com/AztecProtocol/aztec-packages/pull/19549)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Jan 6, 2026  
End Date: Jan 14, 2026  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Simulation: context\_events.hpp, context.hpp/cpp, context\_provider.hpp/cpp

* Tracegen: context\_stack\_trace.hpp/cpp and part of [Execution \- report](#tracegen-\(context_stack_trace.cpp\))   
* Circuit: context.pil, context\_stack.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen (context\_stack\_trace.cpp) |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image3] Status | ![No type][image4] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* Pushing to the context stack was not a permutation which is a soundness issue. See [Linear ticke](https://linear.app/aztec-labs/issue/AVM-179/stack-operation-constraints-must-enforce-pushpop-consistency)t.  
* parent\_id is not initialized to be 0 for an enqueued call. This might be a soundness issue even if we did not identify any exploitation.

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
|  |  |  |  |
|  |  |  |  |

# 

# Internal Call-Report

# Internal Call \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#19715](https://github.com/AztecProtocol/aztec-packages/pull/19715)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Jan 16, 2026  
End Date: Jan 20, 2026  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Simulation: internal\_call\_stack\_event.hpp, internal\_call\_stack\_manager.hpp/cpp

* Tracegen: internal\_call\_stack\_trace.cpp and part of [Execution \- report](#tracegen-\(internal_call_stack_trace.cpp\))   
* Circuit: internal\_call\_stack.pil, internal\_call.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen (internal\_call\_stack\_trace.cpp) |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image3] Status | ![No type][image4] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done | None declared here. We checked the internal\_call\_stack ones in execution\_trace.cpp. |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done | No interaction with destination internal\_call.pil |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* Exiting a nested call did not constrain the “internal call” related IDs. Namely, these IDs were not even pushed to the (non internal one) context\_stack. A malicious prover could set any ID referring to previous internal calls.

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
|  |  |  |  |
|  |  |  |  |

# 

# Execution-Report

# Execution \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR (execution.pil): [\#18864](https://github.com/AztecProtocol/aztec-packages/pull/18864)  
Pre-Audit Status: In Progress  
Following Tasks Status: Not started

Start Date: Nov 27, 2025  
End Date: Date  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # execution.hpp/cpp, execution\_event.hpp

* execution\_trace.hpp/cpp  
* execution.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Not started |  |
| **SANITY\_SOURCE** | In progress | Some remaining TODOs. |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Not started |  |
| **TYPE/RANGE** | Not started |  |
| **INTERACTION\_SRC** | Not started |  |
| **SANITY\_SOURCE** | Not started |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit \- execution.pil |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Not started |  |
| **DOCU\_INTERACTIONS** | Not started |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Not started |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Not started |  |
| **COMPLETENESS** | In progress | Done except the interactions. |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* Sha256Compression was throwing std::runtime\_error and the caller in execution.cpp was catching an exception of type Sha256CompressionException. This would lead to an irrecoverable error. This is a completeness issue.  
* `next_pc` was not constrained at all for the standard increment with `instr_length.` This is a severe soundness issue completely affecting the control flow. In addition, at the beginning of an enqueued call `pc == 0` constraint was missing (initialization).  
* `sel_bytecode_retrieval_failure` was not constrained on the row after the first one of the context. (soundness)  
* Dynamic gas factor was not constrained for CALLDATACOPY/RETURNDATACOPY. This is a soundness issue. (There was also a TODO about constraining the dynamic gas factor to zero for all other opcodes.)  
* `sel_instruction_fetching_failure` is underconstrained when no fetching happens (bc retrieval error). Similarly, `sel_opcode_error` was not constrained when no opcode execution occurs. The first one could have led to a malicious prover setting `sel_error == 0` while a bytecode retrieval error happened. The second one is a bit less dramatic because `sel_opcode_error` is constrained to be a boolean and the malicious prover could have set `sel_error = 2`  
* `last_child_success` was not constrained which affects soundness.  
* We forgot to set in execution\_trace.cpp the column `execution_batched_tags_diff_inv` which is a completeness issue.

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Remove TODOs or rename as Note/Remark** | **Person** | Not started | Execution.cpp: 4 TODOs |
|  | **Person** | Not started |  |

# 

# ALU-Report

# ALU \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#18192](https://github.com/AztecProtocol/aztec-packages/pull/18192)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Oct 24, 2025  
End Date: Nov 4, 2025  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # alu.hpp/cpp

* alu\_event.hpp  
* alu\_trace.hpp/cpp  
* alu.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues:

* Boolean conditions for sel\_op\_shl, sel\_op\_shr, sel\_shift\_ops\_no\_overflow were missing.  
* (Was known) Simultaneous div\_by\_0 and sel\_tag\_err were not supported.  
* Output tag for NOT and non-field type was not constrained unconditionally but triggered a tag error. (Soundness issue).  
* The dispatching from execution to alu for SET/CAST did use the destination selector sel\_op\_truncate which did not enforce that sel \== 1 in alu.pil which left \`max\_bits\` and \`max\_value\` completely underconstrained. (soundness issue).  
*  Some lookups to gt, range\_check use a source selector which is not gated by \`sel\_err/sel\_tag\_err\`. This is a completeness issue because such a lookup cannot be satisfied as the corresponding destination event is not emitted in simulation when an error occurs. MUL, DIV, SHL, SHR were affected. Affected lookups:  
  * \#\[GT\_DIV\_REMAINDER\] (no gating for tag mismatches)  
  * \#\[RANGE\_CHECK\_DECOMPOSITION\_A\_LO\]  
  * \#\[RANGE\_CHECK\_DECOMPOSITION\_A\_HI\]  
  * \#\[RANGE\_CHECK\_DECOMPOSITION\_B\_LO  
  * \#\[RANGE\_CHECK\_DECOMPOSITION\_B\_HI\]  
* Undefined behaviors for some bitwise shifts such as “\>\> 128” or “\<\< 128” over uint128\_t  
* Multiplication for tag \< U128 is underconstrained. A missing range check on c\_hi allows a malicious prover to output any value, namely we can choose c\_hi := (a\*b \-c)/(max\_value \+ 1\) for any value of c. This is a soundness issue.  
* SHL/SHR: two\_pow\_shift\_lo\_bits is not constrained when the bit “overflow” is toggled. As a consequence, the LIMB\_SIZE can be arbitrarily chosen so that a\_lo and a\_hi are both compliant with their range check even though there is no overflow (b \< max\_bits). It suffices, to arbitrary chose a\_lo and a\_hi and set:

   two\_pow\_shift\_lo\_bits := ((b \- max\_bits) \- a\_lo)/a\_hi

  This leads to a soundness issue whereby a malicious prover can output 0 even though there is no overflow and output might not be zero.

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Apply COMMON\_PATTERNS in circuit** | **[Jean Monnerat](mailto:jean@aztec-labs.com)** | Not started |  |
|  | **Person** | Not started |  |

# 

# Data-Copy-Report

# Data Copy \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#17877](https://github.com/AztecProtocol/aztec-packages/pull/17877)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Oct 17, 2025  
End Date: Oct 23, 2025  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* data\_copy\_events.hpp  
* data\_copy.hpp/cpp  
* data\_copy\_trace.hpp/cpp  
* data\_copy.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* Discrepancy between TS sim and cpp sim on tag checking of calldata in parent memory? Similar to returndata? Note also that circuit is enforcing (data\_copy.pil) tag to FF while reading.  
* Discrepancies TS sim \- cpp sim:  
  * Check that calldata is out-of-bounds is performed in CALL opcode in TS, while in .cpp it is not performed. There is a similar check in calldatacopy though.  
  * The check in calldatacopy differs from TS because we will only check that the calldata portion which we read is not out-of-bounds.  
  * The same for returndata?  
* If copy\_size \== 0 and data\_offset \> data\_size, data\_copy\_data\_index\_upper\_bound\_gt\_offset was not set properly. This is a completeness issue.  
* Off-by-one issue while comparing max\_read\_addr and AVM\_HIGHEST\_ADDRESS. Same for write.This is a completeness issue.  
* Missing constraint to enforce that once we enter padding we stay until the end  
* Missing propagation of the context\_id’s to subsequent rows.  
* Missing propagation of clk.  
* Several boolean constraints were missing.  
* sel\_cd\_copy/sel\_rd\_copy are not constrained beyond the row with sel\_start \== 1  
* The trace did not enforce that computation is performed until the row where sel\_end \== 1\. A malicious prover could have truncated the computation.  
* sel\_end could have been toggled prematurely as err is not constrained beyond the first row and the gating factor sel\_start was missing in \#\[END\_ON\_ERR\].

# Questions

* Is parent\_calldata\_addr \== 0 and parent\_calldata\_size for a top-level call correctly constrained in execution.pil or context.pil?

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **TODOs cleanup** | **[Ilyas Ridhuan](mailto:ilyas@aztec-labs.com)** | Not started |  |
| **Tests with calldata/returndata with non-FF values** | **Person** | Not started | We do not have easy current capabilities to test this. It requires nested call with custom bytecode. |
| **Apply Common Circuit Patterns** | **[Jean Monnerat](mailto:jean@aztec-labs.com)** | Not started | Once we are ready with the pattern format, we can revisit and apply them. |

# 

# Merkle-Check-Report

# Merkle Check \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#17771](https://github.com/AztecProtocol/aztec-packages/pull/17771)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Oct 15, 2025  
End Date: Oct 16, 2025  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* merkle\_check\_event.hpp  
* merkle\_check.hpp/.cpp  
* merkle\_check\_trace.hpp/.cpp  
* merkle\_check.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done | When Merkle check fails, a runtime error is thrown and dest events (poseidon2) are emitted without src event. It is an irrecoverable error case. |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* **Under-constraint:** The \`start\` boolean did not enforce to be on an active row \`sel \==1\` which allows a malicious prover to bypass most of the constraints. We did not analyze in detail exploitation but it probably allows any “fake read/write”. It is mitigated by adding the constraint **\#\[SELECTOR\_ON\_START\].**  
* **Under-constraint for \`index\_is\_even\`:** On a row where \`end \== 1\`, the boolean \`index\_is\_even\` is not constrained and therefore a malicious prover could swap the sibling and the node in relevant constraints such as \#\[ASSIGN\_NODE\_LEFT\_OR\_RIGHT\_READ\], …    
* 2 underconstraints in poseidon2\_hash.pil on trace structure (trace continuity missing and \`end \== 1\` implying \`sel \== 1\`).

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Apply Common Circuit Patterns** | **[Jean Monnerat](mailto:jean@aztec-labs.com)** | Not started | Once we are ready with the pattern format, we can revisit and apply them. |
|  | **Person** | Not started |  |

# 

# TX-Report

# TX \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PRs: [\#18336](https://github.com/AztecProtocol/aztec-packages/pull/18336)  [\#18606](https://github.com/AztecProtocol/aztec-packages/pull/18606)  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Nov 5, 2025  
End Date: Nov 26, 2025  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Events: tx\_events.hpp

* # Simulation: tx\_execution.hpp/cpp

* Tracegen: tx\_trace.hpp/cpp  
* Circuits: tx.pil, tx\_discard.pi, tx\_context.pill

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done | N/A |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* Phase value is not initialized. A malicious prover could probably skip an arbitrary number of phases. This is a soundness issue.  
* Phase value static attributes did not have propagation constraints. (This was known and already marked as a TODO.)  
* Interactions for dispatching public call requests and retrieving the output were performed through 2 lookups instead of permutations. A malicious prover could have inserted extra public call requests in execution.  
* is\_padded was not implying end\_phase. A malicious prover could keep the same phase\_value on the next row by not toggling end\_phase and remaining\_phase\_counter would have underflowed and the tx trace would be extended until the end. It might not be practically exploitable but as the safeguard is very cheap we decided to add this constraint. (\#\[IS\_PADDED\_END\_PHASE\])  
* Selector ​​is\_public\_call\_request can be toggled without sel \== 1\. This would allow a malicious prover to insert illegitimate public call requests. The same situation occurs for is\_collect\_fee and is\_cleanup selectors. It is less clear how exploitable these ones are but we added constraints activating sel for both cases as well.  
* Completeness issue for a first padded row (non-revertible nullifier is empty). The column `should_read_gas_limit` is set to \`1\` through “handle\_first\_row()” but then is overridden in “handle\_padded\_row” to be \`0\` which is wrong. Not sure if it can happen that there is zero non-revertible nullifier though. Same issue for the column `tx_gas_limit_pi_offset.`  
* The selectors for note\_hash, nullifier, l2\_to\_l1\_message emissions are underconstrained (e.g., outside of activated trace or padded row) and a malicious prover could emit them in an non-legitimate way. This is a soundness issue. We constrain these selectors in a more strict way:

`should_note_hash_append = should_try_note_hash_append * (1 - reverted);`  
`instead of:`  
`should_try_note_hash_append * (should_not_hash_append - (1 - reverted))`

* The column `parent_calldata_addr` is not constrained to zero for an enqueued call. A malicious prover could have shifted the offset for the calldata values.  
* Completeness Issue: The column `tx_should_l2_l1_msg_append` is not toggled if `discard == 1` otherwise it violates relation `#[WRITE_L2_L1_MSG].` The trace generation did not take into account the value of `discard` to populate `tx_should_l2_l1_msg_append.`

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Constrain l1\_l2\_tree\_size to be immutable** | **[Jean Monnerat](mailto:jean@aztec-labs.com)** | Done |  |
| **More tests with discard and l2\_to\_l1 messages** | **Person** | Not started |  |

# 

# ECC-Report

# ECC \- Pre-Audit \- Report

Author: **[Miranda Wood](mailto:miranda@aztec-labs.com)**  
PR: [\#19694](https://github.com/AztecProtocol/aztec-packages/pull/19694) (docs), [\#19739](https://github.com/AztecProtocol/aztec-packages/pull/19739) (fuzzing), [\#19848](https://github.com/AztecProtocol/aztec-packages/pull/19848) (efficiency)  
Pre-Audit Status: Done  
Following Tasks Status: In Progress

Start Date: Jan 9, 2026  
End Date: Jan 27, 2026  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Events: ecc\_events.hpp

* # Simulation: (gadgets/) ecc.hpp/cpp (no pure impl)

* Tracegen: ecc\_trace.hpp/cpp/.test.cpp  
* Circuits: ecc.pil, ecc\_mem.pil, scalar\_mul.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image5] Status | ![No type][image6] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done | Events don’t have default values, but are never emitted using defaults |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **CHECK\_ISA\_SPEC** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image5] Status | ![No type][image6] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done | Assuming to\_radix internals are safe |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image5] Status | ![No type][image6] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted | Partially done for bools, zero check, latch |
| **INTERACTIONS\_USE** | Done | Done, but still considering use of ecc add for address derivation (see below re ivk) |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

* Completeness: possible for no operation predicates to be set when exactly one must be true (fixed [here](https://github.com/AztecProtocol/aztec-packages/pull/19471))  
  * This issue was originally found because we accept multiple representations of the point at infinity \- this no longer causes actual errors but is confusing/a footgun/sets incorrect flags in circuit. Now [fixed](https://github.com/AztecProtocol/aztec-packages/pull/19462).  
* ~~Possible known issue~~ Claimed to be fixed [here](https://github.com/AztecProtocol/aztec-packages/pull/19584/files), but unclear where exactly the key is asserted (other keys are explicitly asserted). Since `ecc.pil` does not guarantee the point is on the curve (we assume the calling circuit constrains this), it may be possible for the `incoming_viewing_key` in `address_derivation.pil` to not be on the curve.  
  * The blackbox function does seem to check this (see `noir/noir-repo/acvm-repo/bn254_blackbox_solver/src/embedded_curve_ops.rs` \-\> `embedded_curve_add()` \-\> `create_point()`) \- is this sufficient for us?  
  * Discussed recently [here](https://github.com/AztecProtocol/aztec-packages/pull/19134/files#r2640410288)  
  * Note that this is not the case for the `preaddress_public_key` since this is derived inside `address_derivation.pil` using scalar multiplication against the known generator point  
* (Low priority) Inconsistent naming:  
  * `ecc` vs `ec (`Opcode: `EC_ADD`, sim/circuit names: `ecc_add)`  
    * Fix would affect: `ecc_mem.pil, execution.pil -> DISPATCH_TO_ECC_ADD, ecc_events.hpp, execution.cpp -> ecc_add()`  
  * Memory aware circuit filename: `ecc_mem.pil` namespace: `ecc_add_mem`  
  * Rename `end` to `latch` (or vice versa) to remain consistent  
* (Low priority) Small efficiency gains:  
  * See third task below \- can reduce the lookup tuple `scalar_mul -> double`  
  * Can likely remove the boolean constraints on `start` and `end` in `scalar_mul` due to other constraints based on bools like `sel`, `first_row`, etc. (did not remove as a following task since it would remove a clarifying relation for very small gain)

# Following Tasks

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image5] Status | ![No type][image6] Notes |
| **Fix op completeness** | **[David Banks](mailto:david@aztec-labs.com)** | Done | Fixed [here](https://github.com/AztecProtocol/aztec-packages/pull/19471) |
| **[AVM-193](https://linear.app/aztec-labs/issue/AVM-193/normalise-input-infinity-points-to-ecc-add) Normalise infinity points** | **[Miranda Wood](mailto:miranda@aztec-labs.com)** | Done | Fixed [here](https://github.com/AztecProtocol/aztec-packages/pull/19462) |
| **Reduce lookup tuple for scalar mul \-\> double** | **[Miranda Wood](mailto:mirandavcw@gmail.com)** | Done | Done [here](https://github.com/AztecProtocol/aztec-packages/pull/19848) |
| **Confirm approach to checking ivpk is on the curve** | **Person** | Not started | See security findings \- currently unconstrained in the AVM and unclear where it should be enforced |

# Poseidon2-Report

# Poseidon2 \- Pre-Audit \- Report

Author: **[Jean Monnerat](mailto:jean@aztec-labs.com)**  
PR: [\#19963](https://github.com/AztecProtocol/aztec-packages/pull/19963)  
Pre-Audit Status: Done  
Following Tasks Status: Completed

Start Date: Jan 20, 2026  
End Date: Jan 27, 2026  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Simulation: poseidon2.hpp/cpp, poseidon2\_event.hpp

* Tracegen: poseidon2\_trace.hpp/cpp  
* Circuit: poseidon2\_perm.pil, poseidon2\_hash.pil, poseidon2\_mem.pil, poseidon2\_params.pil, generated optimized file: optimized/relations/poseidon2\_\*\*\* (check that all constraints are accounted for)

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **CHECK\_ISA\_SPEC** | Done |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* Most of usages of poseidon2\_hash.pil is not passing \`input\_len\` as part of the lookup on the row where \`start \==1\`. As a consequence, a malicious prover can modify \`input\_len\` and \`padding\` while keeping \`num\_perm\_rounds\_rem\` unchanged on the other rows. This means that the hashing value can be computed with a wrong IV and therefore a wrong hash value will be derived. A nasty example is an incorrect slot derivation in the fee collection ( \#\[BALANCE\_SLOT\_POSEIDON2\] in tx.pil). This also impacts single row computations. Namely, for the “fee collection”, we hash { FEE\_JUICE\_BALANCES\_SLOT, fee\_payer } but we can mutate the IV to (1 \<\<64) or (3\<\<64) instead of (2 \<\< 64). The task [AVM-213](https://linear.app/aztec-labs/issue/AVM-213/missing-input-len-column-into-poseidon2-hash-start-row-is-not-sound) will mitigate this.

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **[AVM-213](https://linear.app/aztec-labs/issue/AVM-213/missing-input-len-column-into-poseidon2-hash-start-row-is-not-sound)** | **Person** | Done |  |
|  | **Person** | Not started |  |

# 

# To\_Radix-Report

# To\_Radix \- Pre-Audit \- Report

Author: **Person**  
PR: [\#20455](https://github.com/AztecProtocol/aztec-packages/pull/20455)   
Pre-Audit Status: In Progress  
Following Tasks Status: Not started

Start Date: Jan 28, 2026  
End Date: Date  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Simulation: common/to\_radix.cpp/hpp, gadgets/to\_radix.cpp/hpp, to\_radix\_event.hpp

* Tracegen: to\_radix\_trace.cpp/hpp  
* Circuit: to\_radix.pil, to\_radix\_mem.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done | Not done everywhere but readability is fine. |
| **INTERACTION\_EVENTS** | Not started |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **CHECK\_ISA\_SPEC** | Not started |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Not started |  |
| **INTERACTION\_SRC** | Not started |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Not started |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Not started |  |
| **DOCU\_INTERACTIONS** | Not started |  |
| **DOCU\_INSIDE** | Not started |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Not started |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Not started |  |
| **COMPLETENESS** | Not started |  |
| **SKIPPABLE** | Not started |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* Soundness issue because we did not prevent a malicious prover from raising `sel_invalid_bitwise_radix` even when `radix == 2` and `is_output_bits == 1`. In short, the prover could raise an error which is not genuine.  
* 

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
|  | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# Bytecode Decomposition-Report

# Bytecode Decomposition \- Pre-Audit \- Report

Author: **[Miranda Wood](mailto:miranda@aztec-labs.com)**  
PR: [\#20120](https://github.com/AztecProtocol/aztec-packages/pull/20120) (docs), [\#20171](https://github.com/AztecProtocol/aztec-packages/pull/20171) (possible issue repro), [\#20254](https://github.com/AztecProtocol/aztec-packages/pull/20254) (fix for issue)  
Pre-Audit Status: Done  
Following Tasks Status: In Progress

Start Date: Jan 26, 2026  
End Date: Feb 13, 2026  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* Events: bytecode\_events.hpp \-\> BytecodeDecompositionEvent  
* Simulation: (gadgets/) bytecode\_manager.hpp/cpp \-\> decomposition\_events, (standalone/) pure\_bytecode\_manager.hpp/cpp \-\> bytecodes\[bytecode\_id\]  
* Tracegen: bytecode\_trace.hpp/cpp/.test.cpp \-\> process\_decomposition()  
* Circuits: bc\_decomposition.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image7] Status | ![No type][image8] Notes |
| **DOCU\_FUNCTIONS** | Done | Partial \- best to complete in Bytecode Retrieval? |
| **EVENT\_INIT** | Done | Events don’t have default values, but are never emitted using defaults |
| **EMIT\_EXPLICIT\_EVENT** | Done | Note: retrieval events are built incrementally (revisit this in bc\_retrieval audit) |
| **INTERACTION\_EVENTS** | Done | Note: there is a BB\_ASSERT in the fn which emits hashing events, but this occurs before the decomp. event emission, so we cannot emit only one. |
| **SANITY\_SOURCE** | Done | Also checked the pure impl, which simply stores bytecode in a flat map (no events, obviously). Does use class\_id to dedup rather than hash, but this is well documented. |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **CHECK\_ISA\_SPEC** | Omitted |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image7] Status | ![No type][image8] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done | Only ‘outgoing’ lookup is to precomputed.sel\_range\_8, gated by sel. Multiperm columns (sel\_packed\_read\[i\]) are set separately. |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image7] Status | ![No type][image8] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted | Partially done for bools, zero check, latch |
| **INTERACTIONS\_USE** | Done | Done from the perspective of decomp, but should review ‘outgoing’ interactions in `instr_fetching` and `bc_hashing` in their own audits |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

* **\<Update post PR:** the use of permutations (for both packed values and start row size in `bc_hashing`) now prevent some aspects of this. The values must be packed correctly due to `PC_IS_PACKED`. So, though we could have two decomposition traces for one bytecode id, it seems we can’t inject any malicious values that instruction fetching could be forced to use.**\>** (For other audits?) we must ensure that uniqueness of bytecode\_id is enforced (it is mentioned in the code we intentionally don’t do this in the decomp trace), otherwise we may be able to add extra rows after `last_of_contract` for some bytecode\_id. This does not seem to be exploitable because:  
  * For bytecode size checks:  
    * We constrain that `bytes_remaining = 1 <==> last_of_contract = 1` and `bytes_remaining` decrements from `pc = 0`, so size will always correspond to that of the first row.  
    * We cannot set a shorter bytecode size at the first row, then insert `last_of_contract` early, as `bytes_pc_plus_i` are shifted or constrained to be 0\. Similarly, we cannot set a longer bytecode size and set `last_of_contract` late to inject garbage.   
  * For bytecode value checks:  
    * We *can* add new rows with new values, but they cannot continue `pc` since we force `pc == 0` after the `last_of_contract` row. So they would ‘replace’ values rather than extend the bytecode i.e. one bytecode\_id would have two possible `packed_field` values at `pc = 0`, but we cannot extend the same bytecode such that the hashing trace adds a new field on the end of the hash preimage.  
* **Update: fixed** \- We can, however, set a longer bytecode size and ‘include’ trailing zeros. This shouldn’t change the id (= the hash) since trailing zeros are already ‘included’ in the packed fields regardless of whether they are part of the bytecode or not. ~~But this does mean instruction fetching will ‘read’ a trailing zero \- is this bad?~~ The fact that we can truncate bytecode (validly) ending in zeros and force a tx revert is bad\!  
  * Added a PR with repro of the above [here](https://github.com/AztecProtocol/aztec-packages/pull/20171)  
  * Added a PR with fix [here](https://github.com/AztecProtocol/aztec-packages/pull/20254) (merged)  
* **Note: testing only** \- We rely on `bc_hashing.pil` for correctness of the id vs the bytecode itself. ~~The permutation does pass if we don’t ‘run’ a hashing circuit since the source selectors (in the hashing trace) will be off. Simulation ensures a hashing event always precedes a decomposition event. Q: can a malicious prover just ignore/omit hashing events to inject bad bytecode?~~  If we omit a bytecode hashing event, proving will fail, however `check_multipermutation_interaction` does not catch this because it only checks from SRC (here, `bc_hashing`) selectors, and skips if these are not on. See task below.  
* **(Low priority)** Inconsistent naming:  
  * There are many bools in this trace, some preceded by `sel_`, some not. I did add `sel_` to some obvious ones (`is_windows_eq_remaining` \-\> `sel_windows…`), but some seem a bit messy to go over (`last_of_contract`), we should keep them consistent.  
  * Some files are named `bytecode_…`, some are `bc_…`, which makes it difficult to find certain files/functions.  
  * We should probably decide on what to call the common pattern constraining `sel` consistency:  
    * In `ecc`/`radix`/`unencrypted_log` traces:  
    *    \#\[SELECTOR\_CONSISTENCY\]  
    *    (sel' \- sel) \* (1 \- LATCH\_CONDITION) \= 0;  
    * In the majority of other multi row traces:  
    * \#\[TRACE\_CONTINUITY\]  
    * (1 \- precomputed.first\_row) \* (1 \- sel) \* sel' \= 0;

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image7] Status | ![No type][image8] Notes |
| **Ensure** `check_multipermutation_interaction` **checks bidirectionally** | **[Miranda Wood](mailto:miranda@aztec-labs.com)** | Not started | Low prio \- testing QOL |
| **Look into bytecode zero extension/truncation** | **[Miranda Wood](mailto:miranda@aztec-labs.com)** | Done | It is indeed a problem \- fix PR above in PR list. |
| **Use common patterns and document byte length use** | **[Miranda Wood](mailto:miranda@aztec-labs.com)** | Done | ~~Waiting on above task’s PR to be merged in~~ In review |
| **Confirm skippable relations are complete** | **[Miranda Wood](mailto:miranda@aztec-labs.com)** | Done |  |

# NoteHashTreeCheck-Report

# NoteHashTreeCheck- Pre-Audit \- Report

Author: **[Alvaro Rodriguez Villalba](mailto:alvaro@aztecprotocol.com)**  
PR: https://github.com/AztecProtocol/aztec-packages/pull/20386  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Feb 10, 2026  
End Date: Feb 12, 2026  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* Events: note\_hash\_tree\_check\_event.hpp \-\> NoteHashTreeReadWriteEvent  
* Simulation: (gadgets/) note\_hash\_tree\_check.hpp/cpp   
* Tracegen: note\_hash\_tree\_check\_trace.hpp/cpp  
* Circuits: note\_hash\_tree\_check.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **CHECK\_ISA\_SPEC** | Omitted |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* No relevant security issues found.

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Add unit test XZY** | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# L1ToL2MsgTreeCheck \- Report

# L1ToL2MsgTreeCheck \- Pre-Audit \- Report

Author: **[Alvaro Rodriguez Villalba](mailto:alvaro@aztecprotocol.com)**  
PR: https://github.com/AztecProtocol/aztec-packages/pull/20443  
Pre-Audit Status: Done  
Following Tasks Status: Not started

Start Date: Feb 12, 2026  
End Date: Feb 12, 2026  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* Events: l2\_to\_l2\_message\_tree\_check\_event.hpp \-\> L1ToL2MessageTreeCheckEvent  
* Simulation: (gadgets/) l1\_to\_l2\_message\_tree\_check.hpp/cpp   
* Tracegen: l1\_to\_l2\_message\_tree\_check\_trace.hpp/cpp  
* Circuits: l1\_to\_l2\_message\_tree\_check.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **CHECK\_ISA\_SPEC** | Omitted |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* No relevant security issues found.

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
|  | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

# NullifierTreeCheck-Report

# NullifierTreeCheck \- Pre-Audit \- Report

Author: **[Alvaro Rodriguez Villalba](mailto:alvaro@aztecprotocol.com)**  
PR: \<Link to the relevant PR\>  
Pre-Audit Status: Not Started  
Following Tasks Status: Not started

Start Date: Feb 16, 2026  
End Date: Date  
Following Tasks \- Completion Date:  Date

# Source Code Scope

* # Events: nullifier\_tree\_check\_event.hpp \-\> NullifierTreeCheckEvent

* # Simulation: (gadgets/) nullifier\_tree\_check.hpp/cpp 

* # Tracegen: nullifier\_tree\_check\_trace.hpp/cpp

* # Circuits: nullifier\_check.pil

# Check Lists

| Simulation |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **EVENT\_INIT** | Done |  |
| **EMIT\_EXPLICIT\_EVENT** | Done |  |
| **INTERACTION\_EVENTS** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADER\_IMPORTS** | Done |  |
| **CHECK\_ISA\_SPEC** | Omitted |  |
| **UNIT\_TEST** | Omitted |  |

| TraceGen |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_FUNCTIONS** | Done |  |
| **TYPE/RANGE** | Done |  |
| **INTERACTION\_SRC** | Done |  |
| **SANITY\_SOURCE** | Done |  |
| **CPP\_HEADERS** | Done |  |
| **INTERACTIONS\_DECL** | Done |  |

| Circuit |  |  |
| ----- | :---- | :---- |
| Task | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **DOCU\_MAIN** | Done |  |
| **DOCU\_INTERACTIONS** | Done |  |
| **DOCU\_INSIDE** | Done |  |
| **HEADERS\_SANITY** | Done |  |
| **TYPE/RANGE** | Done |  |
| **COMMON\_PATTERNS** | Omitted |  |
| **INTERACTIONS\_USE** | Done |  |
| **COMPLETENESS** | Done |  |
| **SKIPPABLE** | Done |  |
| **POSITIVE\_TESTS** | Omitted |  |

# Security Findings

Mention security findings such as missing constraints, completeness issues.

* No relevant security issues found.

# Following Tasks

List any potential task which must be performed following the pre-audit pass.

| Following Tasks |  |  |  |
| ----- | :---- | :---- | :---- |
| Task | Owner | ![Dropdowns][image1] Status | ![No type][image2] Notes |
| **Add unit test XZY** | **Person** | Not started |  |
|  | **Person** | Not started |  |

# 

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQCAYAAAAWGF8bAAAAx0lEQVR4Xu2TYRHCMAyFKwEJSEBCjyVpXIAEHIATJCBhEpCAhEkA0tEtTVcod/zku8ufvDR7fduc+/NTmHkNge6t1QU82x0TQHRMg8i4t7rGI266QJc0b3Xt7Gq1d3jvV69zQyZUn9QAMHg5K8vnpuTBtFNzXzEawj5rKL0AmE7pFku3KXrR8jPHeaRELy00m2NhuYIstT1hPB8OqoF9dKmDbQQD3ZZcTznIJ2S1GmlZ5k4DhENa3FrbDz+Bk5eTIqhVdFbJ8wG0lJX5M/zhmwAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQAQMAAAAs1s1YAAAABlBMVEUAAABER0byc6G0AAAAAXRSTlMAQObYZgAAAB9JREFUeF5jYEAD9h8YmEA0MwOYZmSWWQjhs4H56BgAT4ECDeGaeV4AAAAASUVORK5CYII=>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQCAYAAAAWGF8bAAAAx0lEQVR4Xu2TYRHCMAyFKwEJSEBCjyVpXIAEHIATJCBhEpCAhEkA0tEtTVcod/zku8ufvDR7fduc+/NTmHkNge6t1QU82x0TQHRMg8i4t7rGI266QJc0b3Xt7Gq1d3jvV69zQyZUn9QAMHg5K8vnpuTBtFNzXzEawj5rKL0AmE7pFku3KXrR8jPHeaRELy00m2NhuYIstT1hPB8OqoF9dKmDbQQD3ZZcTznIJ2S1GmlZ5k4DhENa3FrbDz+Bk5eTIqhVdFbJ8wG0lJX5M/zhmwAAAABJRU5ErkJggg==>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQAQMAAAAs1s1YAAAABlBMVEUAAABER0byc6G0AAAAAXRSTlMAQObYZgAAAB9JREFUeF5jYEAD9h8YmEA0MwOYZmSWWQjhs4H56BgAT4ECDeGaeV4AAAAASUVORK5CYII=>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQCAYAAAAWGF8bAAAAx0lEQVR4Xu2TYRHCMAyFKwEJSEBCjyVpXIAEHIATJCBhEpCAhEkA0tEtTVcod/zku8ufvDR7fduc+/NTmHkNge6t1QU82x0TQHRMg8i4t7rGI266QJc0b3Xt7Gq1d3jvV69zQyZUn9QAMHg5K8vnpuTBtFNzXzEawj5rKL0AmE7pFku3KXrR8jPHeaRELy00m2NhuYIstT1hPB8OqoF9dKmDbQQD3ZZcTznIJ2S1GmlZ5k4DhENa3FrbDz+Bk5eTIqhVdFbJ8wG0lJX5M/zhmwAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQAQMAAAAs1s1YAAAABlBMVEUAAABER0byc6G0AAAAAXRSTlMAQObYZgAAAB9JREFUeF5jYEAD9h8YmEA0MwOYZmSWWQjhs4H56BgAT4ECDeGaeV4AAAAASUVORK5CYII=>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQCAYAAAAWGF8bAAAAx0lEQVR4Xu2TYRHCMAyFKwEJSEBCjyVpXIAEHIATJCBhEpCAhEkA0tEtTVcod/zku8ufvDR7fduc+/NTmHkNge6t1QU82x0TQHRMg8i4t7rGI266QJc0b3Xt7Gq1d3jvV69zQyZUn9QAMHg5K8vnpuTBtFNzXzEawj5rKL0AmE7pFku3KXrR8jPHeaRELy00m2NhuYIstT1hPB8OqoF9dKmDbQQD3ZZcTznIJ2S1GmlZ5k4DhENa3FrbDz+Bk5eTIqhVdFbJ8wG0lJX5M/zhmwAAAABJRU5ErkJggg==>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAQAQMAAAAs1s1YAAAABlBMVEUAAABER0byc6G0AAAAAXRSTlMAQObYZgAAAB9JREFUeF5jYEAD9h8YmEA0MwOYZmSWWQjhs4H56BgAT4ECDeGaeV4AAAAASUVORK5CYII=>
