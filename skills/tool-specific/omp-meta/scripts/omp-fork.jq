# Telling a fork's copy of its parent's history from what it said itself.
#
# A fork (/fork, /prose) opens by copying the parent's history into its own
# file. OMP gives every copied record a new id and stamps it with the fork's
# creation time, so ids and timestamps can't tell a copy from a fresh record.
# The copy is written in one burst instead: right after the session header,
# each record within a second of the one before (p95 ~130 ms over the whole
# copy), followed by a pause of seconds while the user types.

# A record's timestamp as epoch milliseconds, or null.
def ts_ms:
  (.timestamp? // null) as $ts
  | if ($ts | type) != "string" then null
    else
      (try ($ts
            | capture("^(?<s>[^.Z]+)(\\.(?<f>[0-9]+))?Z$")
            | ((.s + "Z") | fromdateiso8601) * 1000
              + (((.f // "") + "000")[0:3] | tonumber))
       catch null) // null
    end;

# Run state at a session header: open when the session is a fork.
def fork_start:
  if (.parentSession // "") == "" then { open: false, prev: null, copied: false }
  else { open: true, prev: ts_ms, copied: false }
  end;

# Advances the run state over record $r; .copied says whether $r belongs to
# the copy. Records without a timestamp neither extend nor end the run.
def fork_step($r):
  if (.open | not) then .copied = false
  else
    ($r | ts_ms) as $t
    | if $t == null then .copied = false
      elif .prev != null and ($t - .prev) > -1000 and ($t - .prev) < 1000 then
        .prev = $t | .copied = true
      else .open = false | .copied = false
      end
  end;

# The ids of the copied records, as a set, for an array of records in file
# order. Empty for a session that is not a fork.
def fork_copy_ids:
  reduce .[] as $r ({ run: { open: false }, ids: {} };
    if ($r | type) != "object" then .
    elif $r.type == "session" then .run = ($r | fork_start)
    else
      .run |= fork_step($r)
      | if .run.copied and (($r.id | type) == "string") then .ids[$r.id] = true else . end
    end)
  | .ids;
