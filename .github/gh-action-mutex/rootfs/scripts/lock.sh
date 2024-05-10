#!/bin/bash -e

if [ $ARG_DEBUG != "false" ]; then
	set -x
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

source "$SCRIPT_DIR/utils.sh"

if [ $ARG_UNLOCK != "false" ]; then
	"$SCRIPT_DIR"/unlock.sh
	exit $?
fi

echo "Cloning and checking out $ARG_REPOSITORY:$ARG_BRANCH in $ARG_CHECKOUT_LOCATION"

mkdir -p "$ARG_CHECKOUT_LOCATION"
cd "$ARG_CHECKOUT_LOCATION"

__mutex_queue_file=mutex_queue
__repo_url="https://x-access-token:$ARG_REPO_TOKEN@$ARG_GITHUB_SERVER/$ARG_REPOSITORY"
__ticket_id="$GITHUB_RUN_ID-$GITHUB_JOB"
echo "ticket_id=$__ticket_id" >> $GITHUB_STATE

set_up_repo "$__repo_url"
enqueue $ARG_BRANCH $__mutex_queue_file $__ticket_id
wait_for_lock $ARG_BRANCH $__mutex_queue_file $__ticket_id

echo "Lock successfully acquired"

