### Audit Context

Provide a brief summary of the internal audit finding or refactor motivation.

### Changes Made

- List the changes or refactor steps performed.
- Mention if there are any functional changes or if it's purely structural.
- If your change modifies circuits (VKs change), describe how and by how much.

### Checklist

- [ ] Audited all methods of the relevant module/class
- [ ] Audited the interface of the module/class with other (relevant) components
- [ ] Documented existing functionality and any changes made (as per Doxygen requirements)
- [ ] Resolved and/or closed all issues/TODOs pertaining to the audited files
- [ ] Confirmed and documented any security or other issues found (if applicable)
- [ ] Verified that tests cover all critical paths (and added tests if necessary)
- [ ] Updated audit tracking for the files audited (the `=== AUDIT STATUS ===` header at the start of each file; format in `barretenberg/cpp/scripts/audit/README.txt`)

### Notes for Reviewers

(Optional) Call out anything that reviewers should pay close attention to — like logic changes, performance implications, or potential regressions.
