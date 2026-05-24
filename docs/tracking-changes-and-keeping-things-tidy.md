# Tracking changes and keeping things tidy

Once a project is more than a few files, two questions come up over and over:
what did I have an hour ago, and how do I get it back? Canv has an opt-in history
of your workspace that answers both. It runs in the background, takes snapshots
at sensible moments, and lets you browse the past like a time machine. This page
covers what gets captured, how to look at it, and how to put yesterday's version
of a file back in today's workspace.

## Turning history on

History is a per-workspace choice. You decided whether to turn it on during
first-time setup, where the toggle was called **Revision Archaeology**. If you
skipped it then and want it now, the simplest way is to close and reopen the
workspace — the setup card runs again on a workspace with no configuration.

When history is on, Canv keeps its own configuration and a small index of what
it has captured inside the workspace folder. The actual snapshots live in a
dedicated, separate line of git history that Canv manages itself; your normal
git branch, your working state, and your staged changes are never touched. If
your workspace wasn't a git repository, Canv quietly sets one up purely so it has
somewhere to store its own history.

## What gets captured

A snapshot is a copy of the whole workspace tree at a moment in time. Canv takes
one for each of these reasons, and the reason shows as a badge on the snapshot:

- **Workspace init** — once, when history is first turned on.
- **Manual checkpoint** — when you create one by hand.
- **Before an AI edit** — just before the first file change in an AI turn that's
  about to modify files.
- **After an AI edit** — just after the last file change in that same turn.
  Together, the before and after snapshots bracket every AI edit.
- **Idle autosave** — when the workspace has sat idle for ten minutes and the
  working tree differs from the most recent snapshot.
- **Before a rollback** — taken automatically whenever you restore a file, so
  the state you're leaving behind is recoverable too.

## Browsing the timeline

The left sidebar has a **History** tab when history is on. It is split into two
sections.

**Current changes** lists files that differ between your working tree and the
most recent snapshot — anything you've edited, created, or removed since the last
capture. Click a file to open a diff comparing the snapshot to the on-disk
version.

**Timeline** lists every snapshot, newest first, grouped by date with a short
summary and a reason badge. Click a snapshot row to expand it. The expanded view
shows the files that differ between that snapshot and your working tree right
now — marked **M** for modified, **+** for added since the snapshot, and **−**
for removed since the snapshot. The list is worked out on the spot, so it's
always accurate. For modified files, two actions appear on hover: **diff** opens
a snapshot-versus-current comparison in the editor area, and **restore** brings
that single file's snapshot version back to disk after a safety capture.

## Creating a named checkpoint

Above the timeline is a **+** that opens a small text field. Type a short note —
"before AI rewrite of chapter 4", "end of session" — and submit. Canv snapshots
the whole workspace and records your note as the summary. Named checkpoints sit
in the timeline next to the automatic ones, with a **Manual** badge.

## Looking at one file's history

In the file tree, right-click a markdown file and choose **View history**. A
panel opens at the bottom of the window listing every version of that file Canv
has captured — newest first, with the time, the reason, and the snapshot's
summary. The list only includes versions where this particular file actually
changed, so flipping between items always reveals a real difference. Click a row
to open a diff comparing that version to the file as it is on disk now; the
hover action **restore** puts that version back.

That panel can dock at the bottom, dock at the right, or pop into its own window
— useful for putting the file's history on a second screen while you write on the
first. If you open **View history** on another file, the panel retargets; you
only ever see history for the most recently chosen file.

## Restoring a file

Restoring works the same whether you start from a snapshot in the History sidebar
or a row in the per-file history panel. Picking **restore** opens a preview
showing the snapshot version on one side and your current on-disk version on the
other, with two buttons:

- **Cancel** does nothing.
- **Restore** does three things in order. First, if you have unsaved edits in the
  current file, Canv saves them. Second, it takes a fresh snapshot tagged
  **before rollback**, so the state you're about to overwrite is recoverable
  too. Third, the file's content is replaced with the snapshot version, and any
  open tab for that file reloads to show it.

The conflict prompt that normally fires when something changes a file behind the
editor's back is suppressed for restores — Canv knows it made the change.

## Hiding snapshots from the timeline

Some snapshots are useful as safety captures but noisy when you're scrolling back
through your project. Expand a snapshot and the bottom of the expansion has a
**Hide snapshot** link. Hidden snapshots vanish from the timeline; a footer
toggle labelled **Show hidden** brings them back, dimmed, so you can find one and
unhide it. Hiding only changes what the timeline shows — the snapshot isn't
deleted and still counts toward a file's history.

## Up next

If you'd rather build a visual summary of your project than restore text from
yesterday, see
[Building visual views of your project](building-visual-views-of-your-project.md).
