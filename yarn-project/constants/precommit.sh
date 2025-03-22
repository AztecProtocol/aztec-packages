#!/usr/bin/env bash

# Precommit hook simply to warn the user that they've staged a change to constants.nr.
# Longer-term, there might be a more-robust solution, but the goal of this script is
# simply to warn devs, so that they don't forget to regenerate the constants.
# Lots of hours lost to people forgetting to regenerate all the downstream constants.
# This script DOES NOT regenerate the constants, because there's too much to build.
# In the case where they've already generated and staged all the constant files of
# this commit, they'll have to cope with this small bit of noise.

#!/usr/bin/env bash
set -euo pipefail  # Fail on errors, unset variables, and pipeline failures

cd "$(dirname "$0")"  # Change to the script's directory

export FORCE_COLOR=true

FILE_TO_WATCH="noir-projects/noir-protocol-circuits/crates/types/src/constants.nr"

# Check if constants.nr is staged for commit
if git diff --cached --name-only | grep -Fxq "$FILE_TO_WATCH"; then
    echo "It looks like you changed $FILE_TO_WATCH."
    echo ""
    echo -e "\033[33mPlease remember to regenerate the other constants files. If you've already regenerated the constants, please ignore this message.\033[0m"
    echo ""
    echo "Depending on the constants you've changed, these might include: constants.gen.ts, ConstantsGen.sol, constants_gen.pil, aztec_constants.hpp."
    echo ""
    echo -e "You can regenerate these by running: '\033[33myarn remake-constants\033[0m' from the 'yarn-project/constants' dir. If you have changed tree sizes, also run ./yarn-project/update-snapshots.sh."
    echo ""
    echo "We don't automatically regenerate them for you in this git hook, because you'll likely need to also re-build components of the repo. End."
    echo ""
fi
