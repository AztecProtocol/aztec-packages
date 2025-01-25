#!/bin/bash

# Precommit hook to generate the constants if constants.nr is changed. This will save developers hours of time hunting a bug, when in fact all they needed to do was run this script (trust me, I have trodden this dark path before...).

#!/bin/bash
set -euo pipefail  # Fail on errors, unset variables, and pipeline failures

cd "$(dirname "$0")"  # Change to the script's directory

export FORCE_COLOR=true

FILE_TO_WATCH="noir-projects/noir-protocol-circuits/crates/types/src/constants.nr"  # Relative path

# Check if constants.nr is staged for commit
if git diff --cached --name-only | grep -Fxq "$FILE_TO_WATCH"; then
    echo "It looks like you changed $FILE_TO_WATCH."
    echo ""
    echo "Regenerating the other constants files, so you don't lose a day of your life wondering why things aren't working..."
    echo ""

    COMMAND="yarn remake-constants"

    echo "Running `$COMMAND`..."
    echo ""
    $COMMAND # Run the command

    # Stage all the constants files, if they've been changed by the script:
    # We move to the top-level of the repo first, so that we don't have to specify full relative paths, in case someone does some refiling that breaks those paths.
    # cd ../../
    # git add -u -- *constants.gen.ts *ConstantsGen.sol *constants_gen.pil *aztec_constants.hpp

    echo "Constants files re-generated."
    echo ""
    echo "We haven't actually re-staged those re-generated files for you, because there might actually be additional files that you'll need to manually update, e.g. yarn-project/noir-protocol-circuits-types/src/types/index.ts. Sorry about that. But at least it's caught your attention as something that needs to be fixed!"
fi