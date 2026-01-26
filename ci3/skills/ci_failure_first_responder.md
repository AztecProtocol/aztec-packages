# CI Failure First Responder

Analyze a failed CI run and produce a report. Environment: LOG_ID, LOG_URL, REF_NAME, COMMIT_HASH, COMMIT_AUTHOR, CI3_ROOT, SLACK_USER_ID are set.

From root of the repo:

## Steps

1. Get the CI run log tail to understand overall failure:

```bash
./ci.sh log $LOG_ID | tail -200
```

You can usually find the next log id to drill down into the failure.

2. Continue to drill down to the source of the error.

```bash
./ci.sh log <extracted log id> | tail -100
```

Look for error messages, stack traces, assertion failures, timeouts.

3. Once you get the log with the actual error, analyse it.

Note that at the top of the test, you can find a

- Summary: What failed.
- Root cause analysis: The likely cause based on error messages.
- Patterns: Any common themes (infra issues, flaky tests, code bugs)
- Suggested next steps

4. Write the report to redis:

```bash
reportid=${logid}.report
redis_cli SETEX $reportid 604800 "$report"
```

5. Send the report log to slack.

```bash
./ci3/slack_notify "http://ci.aztec-labs.com/$reportid"
```

5. Output final summary to stdout:

```
CI Run: $LOG_ID
Branch: $REF_NAME
Author: $COMMIT_AUTHOR
Failed Tests: <count>
Analysis: <1-2 sentence summary>
Report sent to: $SLACK_USER_ID
```
