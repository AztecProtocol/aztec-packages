# Bash Command Rules

**NEVER append `; echo "EXIT: $?"` or similar exit-code suffixes to any command.** The Bash tool already reports exit codes directly. Adding these suffixes is redundant and causes unnecessary permission prompts.

Bad:
```bash
yarn test src/file.test.ts > /tmp/out.log 2>&1; echo "EXIT: $?"
```

Good:
```bash
yarn test src/file.test.ts > /tmp/out.log 2>&1
```
