# Tracking changes and keeping things tidy

Once a project is more than a few files, two questions keep coming up: what did I
have an hour ago, and how do I get it back? Canv can keep a private history of
your workspace that answers both. This page covers turning it on, the checkpoints
it keeps, browsing what changed, looking at a single file's past versions, and
restoring safely.

## Turning on history

History is something you switch on for a workspace. Once it's on, Canv keeps its
own record of your files alongside them — separate from any other version control
you might use, and never touching the files themselves. It lives privately inside
the workspace and stays out of your file tree.

## Automatic and hand-made checkpoints

Canv saves a **snapshot** of your work in two ways:

- **Automatically**, when you've been idle for a while, so there's always a
  recent point to fall back to without you thinking about it.
- **By hand**, when you want to mark a moment — finishing a chapter, before a big
  cut. Make a checkpoint and give it a short summary so you'll recognise it later.

Changes the AI makes are bracketed automatically — a snapshot before and after —
so an accepted rewrite or an assistant edit is always something you can step back
from.

## Browsing what changed

The history panel lists your snapshots newest-first, grouped by why they were
taken. At the top, a **current changes** entry shows what you've altered since the
last snapshot. Open any snapshot to see the files it touched, marked as modified,
added, or deleted, and view the differences to read exactly what changed between
then and now.

If the list gets cluttered, you can hide a snapshot you don't care about; hiding
only removes it from view, it doesn't throw the history away.

## A single file's history

When you only care about one file, right-click it and view its history. You get
every past version of just that file, each tied to the snapshot it came from.
View the difference between an old version and the current one to see how the
file has moved, and restore a version straight from there.

## Restoring safely

Before a restore actually replaces anything, Canv shows you a side-by-side
comparison of the old version against what you have now, so you can be sure it's
the one you want. When you confirm, it takes a fresh snapshot of the current
state first — a safety capture — so even the restore itself is something you can
undo.

## Up next

Turn your project into something you can look at rather than read in
[Building visual views of your project](building-visual-views-of-your-project.md).
