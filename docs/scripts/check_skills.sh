#!/usr/bin/env bash
# Lints the docs release skills for the mistakes that break them in this repository's layout, where
# aztec-node is the labs/ submodule. Prints <file>:<line>: <rule>: <text> per hit and exits 1 on any.
#
#   check_skills.sh [SKILL.md...]   default: the four docs skills under .claude/skills/
#   check_skills.sh --self-test
#
# Rules:
#   root-tag          a root `git tag`: Labs tags share names with this repo's tags on other commits,
#                     so they are only ever addressed as `git -C labs ...`
#   root-checkout-v   a root `git checkout`/`git switch` of a v... ref or $LABS_TAG
#   root-labs-ref     a root git command given a Labs version as a revision (v<new_version>,
#                     v<old_version>, v<nodeVersion>, v<prev_version>, $LABS_TAG)
#   stash             any `git stash`: every worktree of this repository shares one stash stack
#   cd-yarn-project   `cd yarn-project`: the TypeScript monorepo is labs/yarn-project
#   labs-only-path    labs-aztec-toolchain/ or .release-please-manifest.json outside labs/ (the root
#                     manifest versions the Foundation, not Labs)
#   owner-approval    a push, PR, Slack message or live-network transaction in a section (from the
#                     last heading) that does not state the marker below at or before that line
#
# The marker, written in bold in the skills: Owner approval required
# The git and cd rules read only code (fenced blocks and inline code spans), so prose may say "git tag";
# a git command counts as labs/-scoped when its last -C names a directory called labs. The path and
# owner rules read every line except the frontmatter, and the owner rule skips headings.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
marker='Owner approval required'
skills=(release-docs release-network-docs update-doc-references updating-changelog)

function scan {
  MARKER=$marker perl -e '
    use strict; use warnings;
    my $marker = $ENV{MARKER};
    my $labs_version = qr{v<(?:new_version|old_version|nodeVersion|prev_version)>|\$\{?LABS_TAG\}?};
    my $hits = 0;
    for my $file (@ARGV) {
      open(my $fh, "<", $file) or die "$file: $!";
      my ($n, $frontmatter, $fence, $marked) = (0, 0, "", 0);
      while (my $line = <$fh>) {
        $n++;
        chomp $line;
        if ($n == 1 && $line eq "---") { $frontmatter = 1; next; }
        if ($frontmatter) { $frontmatter = 0 if $line eq "---"; next; }
        if (!$fence && $line =~ /^\s*(`{3,}|~{3,})/) {
          $fence = $1;
        } elsif ($fence && $line =~ /^\s*(`{3,}|~{3,})\s*$/
                 && substr($1, 0, 1) eq substr($fence, 0, 1) && length($1) >= length($fence)) {
          $fence = "";
        } elsif (!$fence && $line =~ /^#{1,6}\s/) {
          $marked = 0;
        }
        my $heading = !$fence && $line =~ /^#{1,6}\s/;
        $marked = 1 if index($line, $marker) >= 0;
        my $code = $fence ? $line : join(" ", $line =~ /`([^`]+)`/g);

        my @rules;
        my $labs_git = 0;
        while ($code =~ /\bgit((?:\s+(?:-C\s+(?:"[^"]*"|\x27[^\x27]*\x27|\S+)|-c\s+\S+|--no-pager))*)\s+([a-z][a-z-]*)([^;&|]*)/g) {
          my ($opts, $sub, $rest) = ($1, $2, $3);
          my $dir = "";
          while ($opts =~ /-C\s+("[^"]*"|\x27[^\x27]*\x27|\S+)/g) { $dir = $1; }
          $dir =~ s/^["\x27]|["\x27]$//g;
          $dir =~ s{/+$}{};
          if ($dir =~ m{(?:^|/)labs$}) { $labs_git = 1; next; }
          push @rules, "root-tag" if $sub eq "tag";
          push @rules, "root-checkout-v"
            if ($sub eq "checkout" || $sub eq "switch") && $rest =~ /(?:^|\s)["\x27]?(?:v[0-9<\$]|\$\{?LABS_TAG\b)/;
          push @rules, "root-labs-ref"
            if $sub =~ /^(?:diff|log|show|merge-base|rev-parse|rev-list|archive|ls-tree|cat-file|grep|describe|worktree|restore|reset)$/
            && $rest =~ /(?:^|[\s"\x27=]|\.\.)(?:$labs_version)(?=\.\.|[:^~\s"\x27]|$)/;
        }
        push @rules, "stash" if $code =~ /\bgit\b(?:\s+-[Cc]\s+\S+)*\s+stash\b/;
        push @rules, "cd-yarn-project" if $code =~/\bcd\s+["\x27]?(?:\.\/)?yarn-project\b/;
        while ($line =~ m{labs-aztec-toolchain/|\.release-please-manifest\.json}g) {
          my $before = substr($line, 0, $-[0]);
          next if $before =~ m{(?:^|[^\w.-])labs/$};
          next if $labs_git && $before =~ /:$/;
          push @rules, "labs-only-path";
          last;
        }
        my $owner = $line =~ /\bgit\b(?:\s+-[Cc]\s+\S+)*\s+push\b/
          || $line =~ /\bgh\s+pr\s+(?:create|merge|comment|review|ready|edit|close)\b/
          || $line =~ /\bgh\s+(?:release|issue)\s+create\b/
          || $line =~ /\bslack\b/i
          || $line =~ /\bcast\s+send\b/
          || $line =~ /\b(?:live[- ]network|testnet|mainnet|funded)\b.*\btransactions?\b/i
          || $line =~ /\btransactions?\b.*\b(?:live[- ]network|funded)\b/i;
        push @rules, "owner-approval" if $owner && !$heading && !$marked;

        my %seen;
        for my $rule (grep { !$seen{$_}++ } @rules) {
          print "$file:$n: $rule: $line\n";
          $hits = 1;
        }
      }
      close $fh;
    }
    exit $hits;
  ' -- "$@"
}

# shellcheck disable=SC2016
function self_test {
  local tmp rc=0 i=0 out
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  # <expected rule>|<snippet>; \n separates lines.
  local bad=(
    'root-tag|```bash\ngit tag -l "v<nodeVersion>"\n```'
    'root-tag|Run `git -C "$CUT" tag --list` first.'
    'root-checkout-v|If it exists, `git checkout v<nodeVersion>`.'
    'root-checkout-v|```bash\ngit switch --detach "$LABS_TAG"\n```'
    'root-labs-ref|```bash\ngit diff v<old_version>..v<new_version> -- yarn-project/ noir-projects/\n```'
    'root-labs-ref|```bash\ngit merge-base --is-ancestor <commit> v<new_version> && echo in-tag\n```'
    'root-labs-ref|Read it with `git show "$LABS_TAG:docs/package.json"`.'
    'root-labs-ref|```bash\ngit log --oneline v<new_version>..origin/next -- docs/\n```'
    'stash|```bash\ngit stash\n```'
    'stash|Use `git -C "$CUT" stash push -u -m cut`.'
    'cd-yarn-project|```bash\ncd yarn-project && node --input-type=module -e "1"\n```'
    'cd-yarn-project|Run `cd ./yarn-project` first.'
    'labs-only-path|```bash\ngrep "^BB_VERSION=" labs-aztec-toolchain/bootstrap.sh\n```'
    'labs-only-path|The pin record is `$root/labs-aztec-toolchain/bin/.pin`.'
    'labs-only-path|Read .release-please-manifest.json for the major version.'
    'labs-only-path|```bash\ngit show origin/next:.release-please-manifest.json\n```'
    'owner-approval|### Step 6: Open a PR\n\n```bash\ngit push -u origin "$BRANCH"\n```'
    'owner-approval|```bash\ngh pr create --base next --title "docs: x"\n```'
    'owner-approval|Post the diff to the Slack thread.'
    'owner-approval|```bash\ncast send 0xabc "f()" --rpc-url "$L1_RPC"\n```'
    'owner-approval|Run the funded transactions against testnet.'
    'owner-approval|**Owner approval required.** Push it.\n\n## Next\n\n```bash\ngit push origin x\n```'
  )
  local good=(
    '```bash\ngit -C labs tag -l "v<nodeVersion>"\n```'
    'The git tag for the version must exist, and git checkout of a tag is never done here.'
    '```bash\ngit -C "$CUT/labs" checkout --detach "$LABS_TAG"\n```'
    '```bash\ngit -C labs fetch --depth 1 origin tag "$LABS_TAG"\n```'
    '```bash\ngit -C labs diff v<old_version>..v<new_version> -- yarn-project/ noir-projects/\n```'
    '```bash\ngit -C labs show "$LABS_TAG:labs-aztec-toolchain/bootstrap.sh" | grep BB_VERSION\n```'
    'Read `git -C labs show "$LABS_TAG:.release-please-manifest.json"`.'
    '```bash\njq -r ".[\".\"]" labs/.release-please-manifest.json\n```'
    'Use `NARGO="$CUT/labs/labs-aztec-toolchain/bin/nargo"`.'
    '```bash\ncd labs/yarn-project && yarn install\n```'
    '```bash\ngit switch -c "docs/update-refs" origin/next\n```'
    '```bash\ngit -C "$CUT" diff "$SYNCED" HEAD -- docs/developer_versioned_docs/version-v<new_version>/\n```'
    '```bash\ngit worktree add -b "docs-cut/$LABS_TAG" "$CUT" "$DEST"\n```'
    '```bash\ngit commit -m "docs: sync from aztec-node@$LABS_TAG"\n```'
    'Never stash: the stash stack is shared by every worktree.'
    '**Owner approval required.** Push and open the PR:\n\n```bash\n# a comment, not a heading\ngit push -u origin "$BRANCH"\ngh pr create --base next\n```'
    '### Step 7: Report to Slack\n\n**Owner approval required.** Post the result to the thread.'
    '---\nname: x\ndescription: posts to Slack\n---\n\n# Title'
    '````markdown\n```diff\n- old\n```\n````\n\n**Owner approval required.** Slack it.'
  )
  for case in "${bad[@]}"; do
    i=$((i + 1))
    printf '%b\n' "${case#*|}" >"$tmp/bad$i.md"
    out=$(scan "$tmp/bad$i.md" || true)
    if ! grep -q ": ${case%%|*}: " <<<"$out"; then
      echo "self-test: missed ${case%%|*}: ${case#*|}" >&2
      rc=1
    fi
  done
  for case in "${good[@]}"; do
    i=$((i + 1))
    printf '%b\n' "$case" >"$tmp/good$i.md"
    if ! out=$(scan "$tmp/good$i.md"); then
      echo "self-test: false hit: $out" >&2
      rc=1
    fi
  done
  [ "$rc" = 0 ] && echo "check_skills self-test: ${#bad[@]} hits, ${#good[@]} clean"
  return "$rc"
}

case ${1:-} in
  --self-test) self_test ;;
  -*) sed -n '2,/^set -e/p' "$0" | sed '$d; s/^# \{0,1\}//' >&2; exit 2 ;;
  '')
    files=()
    for s in "${skills[@]}"; do files+=("$root/.claude/skills/$s/SKILL.md"); done
    scan "${files[@]}" && echo "docs skills: ok (${#files[@]} files)"
    ;;
  *) scan "$@" ;;
esac
