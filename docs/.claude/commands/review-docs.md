---
description: Review documentation for correctness, accuracy, and adherence to conventions
argument-hint: [file-path]
allowed-tools: Read, Grep, Glob
---

# Documentation Review

## Phase 1: Content Review

Review the content of this page: @$ARGUMENTS

Check for correctness and accuracy with the latest source code. Also ensure it is following the conventions outlined in the CLAUDE.md file. If you are unsure about something, ask me and err on the side of removing content that may be out of date or incorrect.

For any code snippets that are in the file, double check to ensure that the syntax is correct. For large code snippets, try to use an #include_code macro instead of hard coding snippets directly.

Try to keep documentation pages concise and information dense. Keep content focused to the topic defined.

## Phase 2: Additional Recommendations

After completing the review above, answer: Do you have any other recommendations for improvements to this page?
