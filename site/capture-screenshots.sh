#!/usr/bin/env bash
# Capture the five landing-page screenshots for the Canv site.
# Run from the repo root: ./site/capture-screenshots.sh
#
# For each shot:
#   1. Prints what to set up.
#   2. Resizes the Canv window with wmctrl.
#   3. Waits for you to press Enter.
#   4. Runs scrot with a delay so you can click on Canv to focus it.
#
# Requires: wmctrl, scrot. Install on Debian/Ubuntu:
#   sudo apt install wmctrl scrot

set -euo pipefail

OUTDIR="site/public/screenshots"
DELAY="${DELAY:-4}"

for cmd in wmctrl scrot; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing: $cmd. Install with: sudo apt install wmctrl scrot" >&2
    exit 1
  fi
done

if [ ! -d "site" ]; then
  echo "Run from the repo root (the directory that contains site/)." >&2
  exit 1
fi

mkdir -p "$OUTDIR"

shot() {
  local name="$1"
  local w="$2"
  local h="$3"
  local desc="$4"

  echo
  echo "─────────────────────────────────────────────────────────────"
  echo "Shot ${name}   (Canv → ${w}×${h})"
  echo "─────────────────────────────────────────────────────────────"
  echo "$desc"
  echo

  wmctrl -x -r canv.canv -e 0,100,100,"$w","$h" || {
    echo "wmctrl failed — is Canv running? Aborting." >&2
    exit 1
  }

  read -r -p "Set up the window, then press Enter. You will have ${DELAY}s to click on Canv to focus it: "
  echo "Capturing in ${DELAY}s — click Canv now…"
  scrot -u -o --delay "$DELAY" "$OUTDIR/$name"
  echo "✓ Saved $OUTDIR/$name"
}

shot "hero.png" 1600 1000 \
"Open chapter-01.md.
Select the paragraph beginning 'The envelope was tucked behind the cast-iron range…'.
Run Polish.
Wait until the inline diff is visible.
Frame the editor + the diff together."

shot "capability-selection.png" 1200 800 \
"Open chapter-02.md.
Select any paragraph.
Open the action menu so all twelve actions are listed
(Grammar & Spelling, Story Reviewer, Logic Checker, Test Reader,
Refine, Free Edit, Polish, Make Shorter, Make Longer, Simplify,
More Sophisticated, Brainstorm)."

shot "capability-diff.png" 1200 800 \
"Open chapter-02.md.
Run Make Shorter (or Polish) on the paragraph
'Mrs Penlee looked at the letter. She picked it up. She turned it over…'.
Capture once the side-by-side diff has finished streaming.
Both Apply and Reject buttons should be visible."

shot "capability-history.png" 1200 800 \
"Make 2–3 edits across different files in CanvDemo and save each one,
so the History tab has multiple snapshots to show.
Then open the History sidebar tab and frame the snapshot list."

shot "capability-chat.png" 1200 800 \
"Open chapter-02.md in the editor.
In the chat panel, ask: 'Read chapter 2 and tell me what is making the middle drag.'
Capture mid-response — ideally with a streaming reply visible
or a tool-call chip showing the AI reading the file."

echo
echo "All shots captured into ${OUTDIR}/"
echo "Next: cd site && npm run build  (and reload the dev server)."
