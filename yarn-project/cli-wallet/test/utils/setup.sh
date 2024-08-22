#!/bin/bash

# Colors
g="\033[32m" # Green
y="\033[33m" # Yellow
b="\033[34m" # Blue
p="\033[35m" # Purple
r="\033[0m"  # Reset
bold="\033[1m"

if [ $# -eq 4 ]; then
    COMMAND="$1 $2 $3"
    alias aztec-wallet="${COMMAND}"
    cd $4 # noir-projects/noir-contracts folder
else
    COMMAND=$1
    alias aztec-wallet="${COMMAND}"
    cd $2 # noir-projects/noir-contracts folder
fi

aztec-wallet () {
    command $COMMAND $@
}

assert_eq () {
    if [ $1 = $2 ]; then
        echo
        echo -e "✅ ${bold}${g}Pass${r}"
        echo
        echo "---------------------------------"
        echo
    else
        echo
        echo -e "❌ ${bold}${r}Fail${r}"
        echo
        exit 1
    fi
}

test_title () {
    echo -e "🧪 ${bold}${b}Test: $@${r}"
    echo
}

warn () {
    echo -e "${bold}${y}$@${r}"
}

bold() {
    echo -e "${bold}$@${r}"
}

section() {
    echo
    bold "➡️ $@"
    echo
}

warn "aztec-wallet is $COMMAND"
echo