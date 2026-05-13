# Tracking changes and keeping things tidy

Once a project is more than a few files, two questions come up over and
over: what did I have an hour ago, and how do I get it back? Canv has
an opt-in history of your workspace that answers both. It runs in the
background, takes snapshots at sensible moments, and lets you browse
the past like a time machine. This page covers what gets captured, how
to look at it, and how to put yesterday's version of a file back in
today's workspace.

## Turning history on

History is a per-workspace choice. You decided whether to turn it on
during the first-time setup when you opened the workspace; the toggle
was called **Revision Archaeology**. If you skipped it then and want it
now, the simplest way is to close and reopen the workspace — the setup
card runs again on a workspace with no configuration file.

When history is on, Canv adds a `.canv/` folder inside your workspace
holding its own configuration plus a small index of what it has
captured. The actual snapshots live in a dedicated git branch named
`canv-history`. Canv writes only to that branch; your normal git
branch, your working state, and the git index are never touched. If
your workspace was not a git repository, Canv quietly initialises one
purely so it can store its own branch.

History does not work on remote (SSH) workspaces. The setup card
disables the toggle in that case.

## What gets captured

A snapshot is a copy of the whole workspace tree at a moment in time.
Canv takes one for each of these reasons:

- **Workspace init** — once, when history is first turned on.
- **Manual checkpoint** — when you create one by hand.
- **Before an AI edit** — before the first file change in an AI chat
  turn that is about to modify files.
- **After an AI edit** — after the last file change in that same
  turn. Together with the before-snapshot, these bracket every AI
  edit.
- **Idle autosave** — when the workspace has been idle for ten minutes
  and the working tree differs from the most recent snapshot.
- **Before a rollback** — taken automatically whenever you restore a
  file, so the state you are leaving behind is recoverable.

The list above is also the **reason** badge you'll see on each
snapshot in the timeline.

## Browsing the timeline

The left sidebar has a **History** tab when history is on. It is split
into two sections.

**Current changes** lists files that differ between your current
working tree and the most recent snapshot — anything you have edited,
created, or removed since the last capture. Click a file to open a
diff comparing the snapshot to the on-disk version.

**Timeline** lists every snapshot, newest first, grouped by date with
a short summary and a reason badge. Click a snapshot row to expand it.
The expanded view shows the files that differ between that snapshot
and your working tree right now — marked **M** for modified, **+** for
added since the snapshot, and **−** for removed since the snapshot.
The list is computed on the spot, not read from a stored hint, so it
is always accurate.

For modified files in the expanded view, two small actions appear on
hover:

- **diff** opens a snapshot-versus-current diff in the editor area.
- **restore** brings the snapshot's version of that single file back
  to disk, after a safety capture.

For files marked added or removed, no diff or restore is offered in
this view (there is nothing in the snapshot to restore for an
added-since file, and reviewing the change in a normal diff doesn't
apply).

## Creating a named checkpoint

Above the timeline is a **+** that opens a small text field. Type a
short note — "before AI rewrite of chapter 4", "end of session" —
and submit. Canv takes a snapshot of the whole workspace and records
your note as the snapshot's summary. Named checkpoints sit in the
timeline next to the automatic ones with a **Manual** badge.

## Looking at one file's history

In the file tree, right-click a markdown file and choose **View
history**. A panel opens at the bottom of the window listing every
version of that file Canv has captured — newest first, with the time,
the reason for that snapshot, and the snapshot's summary.

The list only includes versions where this particular file actually
differs from the version in the previous snapshot, so flipping between
items always reveals a real difference. Click a row to open a diff in
the editor area comparing that version to the file as it is on disk
right now. The hover action **restore** puts that version back on
disk.

The bottom panel can dock at the bottom, dock at the right, or pop
into its own window — useful for putting the file-history list on a
second screen while you write on the first.

If you open **View history** on another file, the panel retargets to
the new one. You only ever see history for the most recently picked
file.

## Restoring a file

Restoring uses the same flow whether you start from the snapshot
expansion in the History sidebar or from a row in the per-file history
panel. Picking **restore** opens a preview dialog showing the snapshot
version on one side and your current on-disk version on the other.
Two buttons:

- **Cancel** does nothing.
- **Restore** does three things in order. First, if you have unsaved
  edits in the current file, Canv force-saves them. Second, Canv
  takes a fresh snapshot of the workspace tagged **before rollback**
  so the state you are about to overwrite is recoverable too. Third,
  the file's content is replaced with the snapshot version, and any
  open editor tab for that file reloads to show the restored
  content.

The conflict prompt that normally fires when something on disk changes
behind the editor's back is suppressed for restores — Canv knows it
did the change.

## Hiding snapshots from the timeline

Some snapshots are useful as safety captures but noisy when you're
scrolling back through your project's history. Expand a snapshot in
the timeline and the bottom of the expansion has a **Hide snapshot**
link. Hidden snapshots vanish from the timeline. A footer toggle
labelled **Show hidden** brings them back, dimmed, so you can find one
and unhide it if needed.

Hiding only changes what the timeline shows; the snapshot itself is
not deleted, and it still counts toward the per-file history walk.

## Up next

If you'd rather build a visual summary of your project than restore
text from yesterday, see
[Building visual views of your project](building-visual-views-of-your-project.md).
