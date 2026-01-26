# Detect Hung Test

Monitor test LOG_ID=$LOG_ID for hangs. Environment: TEST_CMD, LOG_URL, REF_NAME, CI3_ROOT are set.

From root of the repo:

## Steps

1. Get parent log ID from test log header:

```bash
./ci.sh log $LOG_ID | head -10
```

Extract the parent log ID from the "Parent Log:" line (16-char hex string). If no parent log, output "No parent log" and stop.

2. Check test completion by tailing the log:

```bash
./ci.sh log $LOG_ID | tail -50
```

Determine if test finished (look for test summary, exit, pass/fail indicators). If still running, wait 30s and retry. Max 20 minutes.

3. Once test looks complete, check parent log for this test's status:

```bash
./ci.sh log <PARENT_LOG_ID> | grep "$LOG_ID"
```

Look for PASSED/FAILED/FLAKED with our LOG_ID. If only RUNNING or nothing found, the test hung.

4. If hung, alert via:

```bash
curl -X POST https://slack.com/api/chat.postMessage -H "Authorization: Bearer $SLACK_BOT_TOKEN" -H "Content-type: application/json" --data '{"channel":"#aztec3-ci","text":"Hung test: '"$TEST_CMD"' on '"$REF_NAME"' - '"$LOG_URL"'"}'
```

5. Output summary:

```
Log: $LOG_ID | Parent: <id> | Status: <PASSED|FAILED|FLAKED|HUNG|RUNNING>
```
