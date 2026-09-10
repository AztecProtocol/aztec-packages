"""Apply .github/next-code-owners to a pull request, with CODEOWNERS semantics.

Reads the owners file and the list of changed paths, and prints a JSON body for
`POST /repos/{owner}/{repo}/pulls/{n}/requested_reviewers` — or nothing at all
when nobody should be requested. Nothing is requested when the pull request's
merge does not reach `next`, when no changed path has an owner, or when the base
branch carries no owners file (a merge train that has not yet pulled `next`).

Semantics match GitHub's CODEOWNERS: for each changed path the *last* matching
pattern wins, and the pull request's reviewers are the union of those winners
across all changed paths. Patterns follow CODEOWNERS/gitignore rules — a leading
`/` anchors at the repository root, an unanchored pattern matches at any depth, a
trailing `/` means everything beneath a directory, `*` stays within one path
segment and `**` crosses segments.

The pull request's author is dropped: GitHub refuses to request the author as a
reviewer, and asking it to fails the whole request.
"""

import json
import re
import sys

# A merge train's own pull request targets `next`, unless the train is suffixed
# -v<N>, in which case it targets that release line. This mirrors the base_branch
# rule in .github/workflows/merge-train-create-pr.yml; the two must agree about
# where a train ends up.
TRAIN_TO_RELEASE_LINE = re.compile(r"^merge-train/.*-v[0-9]+$")


def reaches_next(base_ref: str) -> bool:
    if base_ref == "next":
        return True
    if not base_ref.startswith("merge-train/"):
        return False
    return not TRAIN_TO_RELEASE_LINE.match(base_ref)


def pattern_to_regex(pattern: str) -> re.Pattern:
    anchored = pattern.startswith("/")
    body = pattern.lstrip("/")
    directory_only = body.endswith("/")
    body = body.rstrip("/")

    out = []
    i = 0
    while i < len(body):
        char = body[i]
        if body.startswith("**", i):
            out.append(".*")
            i += 2
            if i < len(body) and body[i] == "/":
                i += 1
            continue
        if char == "*":
            out.append("[^/]*")
        elif char == "?":
            out.append("[^/]")
        else:
            out.append(re.escape(char))
        i += 1

    # A pattern without a slash in its body (e.g. `*.js`) matches a basename at
    # any depth; one with a slash is relative to the root, like gitignore.
    if anchored or "/" in body:
        prefix = "^"
    else:
        prefix = "(?:^|.*/)"
    # A directory pattern matches everything beneath it; a file pattern matches
    # the file itself, or a directory of that name and everything beneath it,
    # which is how CODEOWNERS treats `/docs`.
    suffix = "/.*" if directory_only else "(?:/.*)?$"
    return re.compile(prefix + "".join(out) + suffix)


def load_rules(owners_file: str) -> list[tuple[re.Pattern, list[str]]]:
    rules = []
    with open(owners_file, encoding="utf-8") as handle:
        for line in handle:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            pattern, *owners = line.split()
            rules.append((pattern_to_regex(pattern), owners))
    return rules


def owners_for(path: str, rules: list[tuple[re.Pattern, list[str]]]) -> list[str]:
    """The owners of the last pattern that matches `path`; empty when none does or
    the winning pattern deliberately names nobody."""
    winner: list[str] = []
    for regex, owners in rules:
        if regex.match(path):
            winner = owners
    return winner


def main() -> int:
    owners_file, changed_file, author, base_ref = sys.argv[1:5]

    if not reaches_next(base_ref):
        return 0

    try:
        rules = load_rules(owners_file)
    except FileNotFoundError:
        return 0

    with open(changed_file, encoding="utf-8") as handle:
        changed = [line.strip() for line in handle if line.strip()]

    users: list[str] = []
    teams: list[str] = []
    for path in changed:
        for owner in owners_for(path, rules):
            handle = owner.lstrip("@")
            if "/" in handle:
                slug = handle.split("/", 1)[1]
                if slug not in teams:
                    teams.append(slug)
            elif handle != author and handle not in users:
                users.append(handle)

    if not users and not teams:
        return 0

    body = {}
    if users:
        body["reviewers"] = users
    if teams:
        body["team_reviewers"] = teams
    print(json.dumps(body))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
