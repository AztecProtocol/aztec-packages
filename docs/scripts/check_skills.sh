#!/usr/bin/env bash
# Lints the docs release skills for the mistakes that break them in this repository's layout, where
# the docs read aztec-node through the checkout of the commit docs/aztec-node.json pins
# ($AZTEC_NODE_DIR, default docs/.aztec-node/tree), never through the labs/ submodule, which is the
# foundation's build input. Prints <file>:<line>: <rule>: <text> per hit and exits 1 on any.
#
#   check_skills.sh [SKILL.md...]   default: the four docs skills under .claude/skills/
#   check_skills.sh --self-test
#
# Rules:
#   root-tag              a root `git tag`: Labs tags share names with this repo's tags on other
#                         commits, so they are only ever addressed in the checkout
#   root-checkout-v       a root `git checkout`/`git switch` of a v... ref or $LABS_TAG
#   root-labs-ref         a root git command given a Labs version as a revision (v<new_version>,
#                         v<old_version>, v<nodeVersion>, v<prev_version>, $LABS_TAG)
#   labs-submodule        labs/ as a directory to run in or read: `git -C` or `cd` into it, a path
#                         under $VAR/labs or ../labs, labs-patches/, labs_env.sh or a root `make labs-*`
#   foundation-toolchain  a nargo or bb this repository builds (noir/noir-repo/target/,
#                         barretenberg/cpp/build/, labs-aztec-toolchain/bin/): the docs run the
#                         published binaries `aztec_node.mts provision` installs
#   toolchain-version     a literal version for a package or binary the pin names (@aztec-labs/*,
#                         @aztec-foundation/*, the installer, nargo, bb, aztec-up): versions come
#                         from `aztec_node.mts env` (AZTEC_VERSION, BB_VERSION, NOIR_VERSION, ...)
#   stash                 any `git stash`: every worktree of this repository shares one stash stack
#   cd-yarn-project       `cd yarn-project`: the TypeScript monorepo is $AZTEC_NODE_DIR/yarn-project
#   checkout-only-path    labs-aztec-toolchain/ or .release-please-manifest.json outside the checkout
#                         (the root manifest versions the Foundation, not Labs)
#   owner-approval        a push, PR, Slack message or live-network transaction in a section (from
#                         the last heading) that does not state the marker below at or before that line
#
# The marker, written in bold in the skills: Owner approval required
# The git, cd and labs-submodule rules read only code (fenced blocks and inline code spans), so prose
# may say "git tag" and snippet paths may keep their labs/ prefix; a git command counts as
# checkout-scoped when its last -C names $AZTEC_NODE_DIR or a .aztec-node/tree directory. The path,
# toolchain and owner rules read every line except the frontmatter, and the owner rule skips headings.
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
        my $checkout_git = 0;
        while ($code =~ /\bgit((?:\s+(?:-C\s+(?:"[^"]*"|\x27[^\x27]*\x27|\S+)|-c\s+\S+|--no-pager))*)\s+([a-z][a-z-]*)([^;&|]*)/g) {
          my ($opts, $sub, $rest) = ($1, $2, $3);
          my $dir = "";
          while ($opts =~ /-C\s+("[^"]*"|\x27[^\x27]*\x27|\S+)/g) { $dir = $1; }
          $dir =~ s/^["\x27]|["\x27]$//g;
          $dir =~ s{/+$}{};
          if ($dir =~ m{^\$\{?AZTEC_NODE_DIR\}?$|(?:^|/)\.aztec-node/tree$}) { $checkout_git = 1; next; }
          if ($dir =~ m{(?:^|/)labs$}) { push @rules, "labs-submodule"; next; }
          push @rules, "root-tag" if $sub eq "tag";
          push @rules, "root-checkout-v"
            if ($sub eq "checkout" || $sub eq "switch") && $rest =~ /(?:^|\s)["\x27]?(?:v[0-9<\$]|\$\{?LABS_TAG\b)/;
          push @rules, "root-labs-ref"
            if $sub =~ /^(?:diff|log|show|merge-base|rev-parse|rev-list|archive|ls-tree|cat-file|grep|describe|worktree|restore|reset)$/
            && $rest =~ /(?:^|[\s"\x27=]|\.\.)(?:$labs_version)(?=\.\.|[:^~\s"\x27]|$)/;
        }
        push @rules, "stash" if $code =~ /\bgit\b(?:\s+-[Cc]\s+\S+)*\s+stash\b/;
        push @rules, "cd-yarn-project" if $code =~/\bcd\s+["\x27]?(?:\.\/)?yarn-project\b/;
        push @rules, "labs-submodule"
          if $code =~ m{\bcd\s+["\x27]?(?:[^\s"\x27;&|]*/)?labs(?:[/"\x27\s;&|)]|$)}
          || $code =~ m{(?:\$\{?\w+\}?|(?<![\\\w.])\.\.?)/labs(?:[/"\x27\s;&|)]|$)}
          || $code =~ m{\blabs-patches/|\blabs_env\.sh\b|\bmake\b[^;&|]*\slabs-[\w-]+};
        push @rules, "foundation-toolchain"
          if $line =~ m{noir/noir-repo/target/|barretenberg/cpp/build/|labs-aztec-toolchain/bin/};
        push @rules, "toolchain-version"
          if $line =~ m{\@aztec-(?:labs|foundation)/[\w.-]+\@v?\d|install\.aztec\.network/v?\d|nargo version = v?\d}
          || $line =~ m{\b(?:BB|NOIR|AZTEC|L1_ARTIFACTS)_VERSION=["\x27]?v?\d}
          || $line =~ m{\baztec-up\b[^;&|`]*\s(?:install\s+)?v?\d+\.\d+}
          || $line =~ m{\b(?:noirup|bbup)\b[^;&|`]*\s-(?:v|-version)\s+v?\d};
        while ($line =~ m{labs-aztec-toolchain/|\.release-please-manifest\.json}g) {
          my $before = substr($line, 0, $-[0]);
          next if $before =~ m{(?:AZTEC_NODE_DIR\}?|\.aztec-node/tree)/$};
          next if $checkout_git && $before =~ /:$/;
          push @rules, "checkout-only-path";
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
    'checkout-only-path|```bash\ngrep "^BB_VERSION=" labs-aztec-toolchain/bootstrap.sh\n```'
    'checkout-only-path|Read .release-please-manifest.json for the major version.'
    'checkout-only-path|```bash\ngit show origin/next:.release-please-manifest.json\n```'
    'checkout-only-path|```bash\njq -r ".[\".\"]" labs/.release-please-manifest.json\n```'
    'labs-submodule|```bash\ngit -C labs tag -l "v<nodeVersion>"\n```'
    'labs-submodule|```bash\ngit -C "$CUT/labs" checkout --detach "$LABS_TAG"\n```'
    'labs-submodule|```bash\ncd labs/yarn-project && yarn install\n```'
    'labs-submodule|```bash\njq -r .version "$CUT/labs/yarn-project/aztec/package.json"\n```'
    'labs-submodule|Run `grep -rn x ../labs/docs` from docs/.'
    'labs-submodule|```bash\ncd "$CUT" && labs-patches/bootstrap.sh apply\n```'
    'labs-submodule|```bash\nmake labs-yarn-project\n```'
    'foundation-toolchain|```bash\nNARGO=$DEST_ROOT/noir/noir-repo/target/release/nargo yarn generate:aztec-nr-api\n```'
    'foundation-toolchain|Pass `BB=../barretenberg/cpp/build/bin/bb`.'
    'foundation-toolchain|The pin record is `$root/labs-aztec-toolchain/bin/.pin`.'
    'toolchain-version|```bash\nyarn add @aztec-labs/aztec.js@6.0.0-rc.3\n```'
    'toolchain-version|Its pin must equal `@aztec-foundation/l1-artifacts@6.0.0`.'
    'toolchain-version|```bash\nbash <(curl -fsSL https://install.aztec.network/6.0.0)\n```'
    'toolchain-version|It must print `nargo version = 1.0.0-rc.3`.'
    'toolchain-version|```bash\nexport BB_VERSION=6.0.0\n```'
    'toolchain-version|Run `aztec-up install 6.0.0` first.'
    'toolchain-version|```bash\nnoirup -v 1.0.0-rc.3\n```'
    'owner-approval|### Step 6: Open a PR\n\n```bash\ngit push -u origin "$BRANCH"\n```'
    'owner-approval|```bash\ngh pr create --base next --title "docs: x"\n```'
    'owner-approval|Post the diff to the Slack thread.'
    'owner-approval|```bash\ncast send 0xabc "f()" --rpc-url "$L1_RPC"\n```'
    'owner-approval|Run the funded transactions against testnet.'
    'owner-approval|**Owner approval required.** Push it.\n\n## Next\n\n```bash\ngit push origin x\n```'
  )
  local good=(
    '```bash\ngit -C "$AZTEC_NODE_DIR" tag -l "v<nodeVersion>"\n```'
    'The git tag for the version must exist, and git checkout of a tag is never done here.'
    '```bash\ngit -C "$AZTEC_NODE_DIR" fetch --depth 1 origin tag "$LABS_TAG"\n```'
    '```bash\ngit -C "${AZTEC_NODE_DIR}" diff v<old_version>..v<new_version> -- yarn-project/ noir-projects/\n```'
    '```bash\ngit -C docs/.aztec-node/tree log --oneline v<old_version>..v<new_version>\n```'
    '```bash\ngit -C "$AZTEC_NODE_DIR" show "$LABS_TAG:labs-aztec-toolchain/bootstrap.sh" | grep BB_VERSION\n```'
    'Read `git -C "$AZTEC_NODE_DIR" show "$LABS_TAG:.release-please-manifest.json"`.'
    '```bash\njq -r ".[\".\"]" "$AZTEC_NODE_DIR/.release-please-manifest.json"\n```'
    '```bash\ncd "$AZTEC_NODE_DIR/yarn-project" && node --input-type=module -e "1"\n```'
    '```bash\nnode docs/scripts/aztec_node.mts provision nargo bb\n```'
    '```bash\nyarn add "@aztec-labs/aztec.js@$AZTEC_VERSION" && bash <(curl -fsSL "https://install.aztec.network/$AZTEC_VERSION")\n```'
    'It must print `nargo version = $NOIR_VERSION`, and `aztec-up install "$AZTEC_VERSION"` is the same.'
    'The `labs/` prefix in snippet paths names the checkout, never the submodule.'
    '```markdown\n#include_code hello labs/noir-projects/noir-contracts/contracts/x/src/main.nr rust\n```'
    '```bash\ngrep -rn "\\.\\./labs/" developer_versioned_docs/\n```'
    '```bash\ngit switch -c "docs/update-refs" origin/next\n```'
    '```bash\ngit -C "$CUT" diff "$PINNED" HEAD -- docs/developer_versioned_docs/version-v<new_version>/\n```'
    '```bash\ngit worktree add -b "docs-cut/$LABS_TAG" "$CUT" "$DEST"\n```'
    '```bash\ngit commit -m "docs: pin aztec-node $LABS_TAG"\n```'
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
