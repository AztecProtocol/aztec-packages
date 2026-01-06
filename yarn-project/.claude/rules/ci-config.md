# CI Configuration

## Marking Tests as Flaky

When a test intermittently fails but shouldn't block CI:

1. Edit `.test_patterns.yml` (at git root, not in yarn-project)
2. Add entry under `tests:` section:

```yaml
- regex: "src/e2e_new_feature/feature.test.ts"
  error_regex: "specific error message"  # Optional: only flag if this error occurs
  owners:
    - *charlie  # Reference existing name
    - *adam     # Can have multiple owners
```

### Adding a New Owner

1. Add to `names:` section: `- newperson: &newperson "SLACK_ID"`
2. Reference in test: `- *newperson`

### Behavior

- Without `error_regex`: Test is always flagged as flaky when it fails
- With `error_regex`: Only flagged when output matches the regex
- `skip: true`: Test won't run at all (avoid unless constantly failing)
- Flaky tests alert owners in #aztec3-ci Slack channel but don't fail CI
