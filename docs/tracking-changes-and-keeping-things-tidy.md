# Tracking changes and keeping things tidy

Once a project gets bigger than a single file, two questions come up
again and again: *what changed since I last looked?* and *did I leave
anything broken?* Canv has a few small features that answer both,
plus the usual ways to export and back up your work. None of this is
mandatory — skip what you don't need.

## Seeing what changed since you last committed

If your workspace is a Git repository, Canv shows the same view of
"what's changed" you'd get from a Git client. Click the branch icon
in the top bar to open it.

The list groups files by state:

- **Changed** — files you've edited but not staged.
- **Staged** — files marked ready for the next commit.
- **Untracked** — new files Git hasn't been told about yet.

Each row shows a tiny letter badge for the kind of change (M for
modified, A for added, D for deleted, R for renamed, U for untracked).
Click any row to open a side-by-side diff in the writing area —
your current version against whatever the file looked like at the
last commit.

The status bar shows the current branch and a quick `+added/−removed`
line count for the workspace overall, so you can glance at it without
opening the panel.

Canv doesn't replace a Git client. There's no commit, push, or pull
button — those still happen in your terminal or in your usual Git
tool. Canv just shows you what's changed, so you can see at a glance
whether you've drifted further than you meant to.

If the workspace isn't a Git repository, the panel says so and the
status bar quietly hides.

## Catching small mistakes before they bite

Canv runs a few structural checks over your markdown files. Open the
**Problems** view at the bottom of the window to see what it found.
The checks are:

- **Broken links** — markdown links that point to a file or anchor
  that doesn't exist. Cross-reference rot.
- **Front-matter** — YAML at the top of a file that's malformed or
  unparseable. Often shows up after a manual edit.
- **Heading skips** — places where you jumped from `##` straight to
  `####`. Less of an error and more of a "did you mean to?".
- **Dead images** — image links pointing at files that aren't in
  the workspace.

Each problem shows the file, the line, and a one-line description.
Click a problem to jump to the offending line.

You can turn each check on or off in the settings tab under
**Problems**. The checks run as you write; click **Re-scan** in the
panel if something went stale.

## Exporting one document

When you need to send a single document elsewhere — to a publisher,
to an editor, into another tool — use the export action. Right-click
the file in the sidebar and pick:

- **Export as .md** saves the markdown source as-is.
- **Export as .txt** strips the markdown formatting and saves plain
  text.

You're prompted for a save location each time. The file in the
workspace is unchanged.

## Backing up everything

If you want a complete safety net — every setting, every saved chat,
every API key — there's a full backup in the settings tab.

- **Export backup** dumps everything into a single JSON file you
  download. Keep this somewhere safe; it includes your API keys.
- **Import backup** reads a backup file and overwrites the current
  state. Canv asks for confirmation first because the import wipes
  what's currently set up.

Importing reloads the app afterwards. You should see your previous
profile, settings, and chat history exactly as you left them.

This backup is for the *Canv app's state*, not your manuscripts —
those are just files on disk. Back them up the way you back up
anything else (Git, Time Machine, whatever you already use).

Next: [Troubleshooting](troubleshooting.md).
