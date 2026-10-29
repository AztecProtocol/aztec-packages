# shellcheck shell=bash
# key_defaults - Find and remove option defaults that look like private keys
#
# CLIs read option defaults from the environment and print them in their help, so a generated
# reference page can carry a real key. A key-shaped default is a `default:` (or `default =`)
# followed by a 32-byte hex value with at least 8 non-zero nibbles; salts such as 0x00…01 and
# the zero value stay.
#
# Source this file; it needs perl.

# Candidate lines for git grep -E; key_defaults_report applies the nibble rule.
# shellcheck disable=SC2034 # read by the scripts that source this file
KEY_DEFAULT_ERE="default[\"']?[[:space:]]*[:=][[:space:]]*[\"']?0x[0-9a-fA-F]{64}"

# Reads "<path>:<line>:<text>" lines (git grep -n output) on stdin and prints
# "<path>:<line> 0x<first 4 hex>…" for each key-shaped default. Never prints more of the value.
key_defaults_report() {
  perl -ne '
    next unless /^(.*?:\d+):(.*)$/s;
    my ($where, $text) = ($1, $2);
    while ($text =~ /default["\x27]?\s*[:=]\s*["\x27]?0x([0-9a-fA-F]{64})(?![0-9a-fA-F])/g) {
      (my $nibbles = $1) =~ tr/1-9a-fA-F//cd;
      print "$where 0x", substr($1, 0, 4), "\xe2\x80\xa6\n" if length($nibbles) >= 8;
    }'
}

# Prints "<label>:<line> 0x<first 4 hex>…" for each key-shaped default in <file>, such as a CLI's
# captured help: generators run it before they write or print anything from that file.
key_defaults_in_file() {
  local matches
  matches=$(grep -nE "$KEY_DEFAULT_ERE" "$1") || [ $? -eq 1 ] || return 2
  [ -z "$matches" ] || key_defaults_report <<<"$2:${matches//$'\n'/$'\n'$2:}"
}

# Removes key-shaped " (default: 0x…)" and ' (default: "0x…")' suffixes from each file, in place.
scrub_key_defaults() {
  perl -pi -e '
    s{[ \t]*\(default:\s*"?0x([0-9a-fA-F]{64})"?\)}{
      (my $nibbles = $1) =~ tr/1-9a-fA-F//cd;
      length($nibbles) >= 8 ? "" : $&
    }ge' -- "$@"
}
