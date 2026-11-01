#!/usr/bin/env bash
# Keep the newest $KEEP images per repository on this k3s node.
# Never removes an image that any container (running or stopped) uses.
# Dry run (shows what it would delete, deletes nothing):  sudo DRY_RUN=1 /usr/local/bin/prune-images.sh
set -euo pipefail

KEEP="${KEEP:-3}"
DRY_RUN="${DRY_RUN:-0}"
CRICTL="${CRICTL:-/usr/local/bin/k3s crictl}"

# Every image reference used by a container, so we can protect it
in_use=$($CRICTL ps -a -o json | jq -r '.containers[] | .imageRef, .image.image' | sort -u)

# One line per image: repository <TAB> image id <TAB> digests
$CRICTL images -o json | jq -r '
  .images[]
  | ((.repoTags // [])[0] // "" | sub(":[^:/]*$"; "")) as $tag
  | ((.repoDigests // [])[0] // "" | sub("@.*$"; "")) as $dig
  | [ (if $tag != "" then $tag else $dig end), .id, ((.repoDigests // []) | join(",")) ]
  | @tsv' |
while IFS=$'\t' read -r repo id digests; do
  [ -z "$repo" ] && continue
  # Build date of the image, used to work out which are newest
  created=$($CRICTL inspecti -o json "$id" | jq -r '.info.imageSpec.created // "0"')
  printf '%s\t%s\t%s\t%s\n' "$repo" "$created" "$id" "$digests"
done |
# Group by repository, newest first, and pick everything after the first $KEEP
sort -t $'\t' -k1,1 -k2,2r |
awk -F '\t' -v keep="$KEEP" '{ n[$1]++; if (n[$1] > keep) print $1 "\t" $3 "\t" $4 }' |
while IFS=$'\t' read -r repo id digests; do
  used=no
  for ref in "$id" ${digests//,/ }; do
    if grep -qxF "$ref" <<<"$in_use"; then used=yes; fi
  done
  if [ "$used" = yes ]; then
    echo "keep (in use): $repo $id"
  elif [ "$DRY_RUN" = 1 ]; then
    echo "would remove: $repo $id"
  else
    echo "removing: $repo $id"
    $CRICTL rmi "$id" || echo "  failed to remove $id"
  fi
done