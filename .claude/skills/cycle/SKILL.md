---
name: cycle
description: Show my Linear issues for the current cycle, grouped by status.
---

# Current Cycle Issues

Query the user's Linear issues for the current cycle and display them grouped by status.

## Steps

1. Use `mcp__linear-server__get_user` with query "me" to get the user's teams.
2. For each team, use `mcp__linear-server__list_cycles` with type "current" to find active cycles.
3. For each active cycle, use `mcp__linear-server__list_issues` with assignee "me" and the cycle ID.
4. Display results grouped by status. Omit empty groups.
   - For open items (Todo, In Progress, In Review, etc.): show a table with columns: Issue number, Title. No URLs.
   - For closed items (Done, Canceled): just list a count (e.g. "9 done, 1 canceled").
