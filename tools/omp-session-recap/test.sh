#!/usr/bin/env bash
set -euo pipefail

# Session selection only: every case runs --dump, so no model is called.
here=$(cd "$(dirname "$0")" && pwd)
export PATH="$here/../../skills/tool-specific/omp-meta/scripts:$PATH"
recap=$here/@omp-session-recap
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

export HOME=$tmp
unset OMP_SESSIONS_DIR
sessions=$tmp/.omp/agent/sessions/proj
work=$tmp/work
elsewhere=$tmp/elsewhere
mkdir -p "$sessions" "$work" "$elsewhere"

# session <file> <id> <cwd> <start> <parent path or ""> then message lines
# "<offset ms>|<role>|<text>", each a child of the one before.
session() {
  local file=$1 id=$2 cwd=$3 start=$4 parent=$5 previous=null n=0 line ms role text
  shift 5
  jq -cn --arg id "$id" --arg cwd "$cwd" --arg ts "${start}.000Z" --arg parent "$parent" \
    '{type:"session", id:$id, cwd:$cwd, timestamp:$ts}
     + (if $parent == "" then {} else {parentSession:$parent} end)' >"$file"
  for line in "$@"; do
    IFS='|' read -r ms role text <<<"$line"
    n=$((n + 1))
    jq -cn --arg id "$id-$n" --argjson parent "$previous" --arg role "$role" --arg text "$text" \
      --arg ts "$(date -ud "${start}Z + $((ms / 1000)) seconds" +%Y-%m-%dT%H:%M:%S).$(printf '%03d' $((ms % 1000)))Z" \
      '{type:"message", id:$id, parentId:$parent, timestamp:$ts,
        message:{role:$role, content:[{type:"text", text:$text}]}}' >>"$file"
    previous="\"$id-$n\""
  done
}

# A root in scope with two forks: one adds a single message, one adds two.
root=$sessions/2026-06-01T10-00-00-000Z_root.jsonl
session "$root" root "$work" 2026-06-01T10:00:00 "" \
  "60000|user|ROOT_QUESTION" "61000|assistant|ROOT_ANSWER"
tiny=$sessions/2026-06-02T10-00-00-000Z_tiny.jsonl
session "$tiny" tiny "$work" 2026-06-02T10:00:00 "$root" \
  "5|user|ROOT_QUESTION" "10|assistant|ROOT_ANSWER" "30000|user|TINY_ONLY"
busy=$sessions/2026-06-03T10-00-00-000Z_busy.jsonl
session "$busy" busy "$work" 2026-06-03T10:00:00 "$root" \
  "5|user|ROOT_QUESTION" "10|assistant|ROOT_ANSWER" "30000|user|BUSY_Q" "31000|assistant|BUSY_A"

# A fork in scope whose parent lives in another folder, so out of scope.
outside=$sessions/2026-06-04T10-00-00-000Z_outside.jsonl
session "$outside" outside "$elsewhere" 2026-06-04T10:00:00 "" \
  "60000|user|OUTSIDE_QUESTION" "61000|assistant|OUTSIDE_ANSWER"
orphan=$sessions/2026-06-05T10-00-00-000Z_orphan.jsonl
session "$orphan" orphan "$work" 2026-06-05T10:00:00 "$outside" \
  "5|user|OUTSIDE_QUESTION" "10|assistant|OUTSIDE_ANSWER" "30000|user|ORPHAN_ONLY"

touch -d 2026-06-01T10:01:01Z "$root"
touch -d 2026-06-02T10:00:30Z "$tiny"
touch -d 2026-06-03T10:00:31Z "$busy"
touch -d 2026-06-04T10:01:01Z "$outside"
touch -d 2026-06-05T10:00:30Z "$orphan"

count() { grep -o -- "$1" <<<"$2" | wc -l; }

dump=$("$recap" "$work" --dump 2>/dev/null)
# The root's history appears once, though both forks in scope copied it.
[[ $(count ROOT_QUESTION "$dump") -eq 1 ]]
# A fork that added two messages contributes just those.
[[ $(count BUSY_Q "$dump") -eq 1 && $(count BUSY_A "$dump") -eq 1 ]]
# A fork that added one message, with its root in the recap, stays out.
[[ $dump != *TINY_ONLY* ]]
# A fork that added one message, with its parent out of scope, comes in
# whole: its copy is the only record of that conversation here.
[[ $(count OUTSIDE_QUESTION "$dump") -eq 1 && $dump == *ORPHAN_ONLY* ]]
[[ $dump == *'<session id="orphan"'* && $dump != *'<session id="tiny"'* ]]

# Scoped to the forks alone, the oldest one carries the copy and the other
# adds only its own messages.
mkdir -p "$tmp/forks-only"
forks_dir=$tmp/.omp/agent/sessions/forks
mkdir -p "$forks_dir"
fork_a=$forks_dir/2026-06-06T10-00-00-000Z_fork-a.jsonl
fork_b=$forks_dir/2026-06-07T10-00-00-000Z_fork-b.jsonl
session "$fork_a" fork-a "$tmp/forks-only" 2026-06-06T10:00:00 "$outside" \
  "5|user|OUTSIDE_QUESTION" "10|assistant|OUTSIDE_ANSWER" "30000|user|A_ONLY"
session "$fork_b" fork-b "$tmp/forks-only" 2026-06-07T10:00:00 "$outside" \
  "5|user|OUTSIDE_QUESTION" "10|assistant|OUTSIDE_ANSWER" "30000|user|B_Q" "31000|assistant|B_A"
touch -d 2026-06-06T10:00:30Z "$fork_a"
touch -d 2026-06-07T10:00:31Z "$fork_b"
forks_dump=$("$recap" "$tmp/forks-only" --dump 2>/dev/null)
[[ $(count OUTSIDE_QUESTION "$forks_dump") -eq 1 ]]
[[ $forks_dump == *A_ONLY* && $forks_dump == *B_Q* && $forks_dump == *B_A* ]]

printf 'PASS: recap keeps copied history once, drops tiny forks with an older relative, keeps orphans\n'
