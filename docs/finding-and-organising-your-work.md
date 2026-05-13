# Finding and organising your work

A writing project is rarely a single file. This page covers everything
about moving around your workspace — listing files, creating folders,
searching for a phrase, jumping to a file by name, and reaching commands
you don't see on screen.

## Browsing the files in your workspace

The left side of the window lists every file and folder in your
workspace. Click a file to open it in the editor; click a folder to
expand or collapse it. The tree updates live when files change on disk,
so creating a file outside Canv (in another editor, with a script) makes
it appear in the tree within a moment.

The header of the tree has two **+** buttons — one to create a new file
in the current folder, one to create a new folder. Right-click anywhere
in the tree for a context menu with the rest of the operations:

- **New file** and **New folder** create children of the folder you
  clicked on (or the workspace root, if you clicked into empty space).
- **Rename** changes a file's name in place. The same option works on
  folders.
- **Delete** sends the file to the system trash. There is no in-app
  undo for a delete; the system trash is the way back. If revision
  history is on, you can also restore the file's last-known content
  from a snapshot — see
  [Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).
- **Pin to context** is only offered on markdown files. A pinned file
  is included in every AI request from this workspace until you unpin
  it.
- **View history** is only offered on markdown files when revision
  history is on. Picking it opens the file's version list in a panel
  beneath the editor.
- **Serve as website** turns a folder into a small browsable site at a
  local URL; see
  [Building visual views of your project](building-visual-views-of-your-project.md).

## Finding a file fast

When you know the file's name but not where it lives, you can summon a
quick-find that floats over the editor. Start typing the file's name and
Canv ranks every file in your workspace by fuzzy match. Pick a result to
open it.

The same overlay also offers your recently-opened files at the top, so
flipping between two or three files you've been editing is one keystroke
away.

## Searching the workspace

For finding a phrase rather than a filename, open the search tab in the
left sidebar. Type a query and Canv returns every match across the
workspace, grouped by file, up to a thousand matches in total. You can
treat the query as a regular expression, make it case-sensitive, or
scope it to a subfolder. Click a match to jump the editor to that line.

Search ignores binary files and very large files. For projects with
thousands of files the first search may take a moment as Canv reads the
files; after that the results stream in as it finishes each file.

## Reaching commands you don't see

Canv has a command palette that lists every action — open settings,
change workspace, toggle the sidebar, run a particular profile action
on the current document, dock the bottom panel to the right, and so
on. Start typing to filter. The palette is the single quickest way to
reach something whose location you don't remember.

The palette comes in two modes — commands, and files — and it remembers
which mode you used last. Switch modes inside the palette by clearing
the query and typing the new one.

## Pinning a reference file

A pinned markdown file rides along with every AI request, on top of the
file or selection you are working on. Use this for a series bible, a
style guide, or a notes file the AI should consult on every turn.

Right-click a markdown file in the tree and choose **Pin to context** to
pin it. The file shows a pin marker in the tree. Right-click it again
and choose **Unpin from context** to remove it.

You can pin more than one file. They all attach to every AI turn until
you unpin them.

## Up next

Once you can find your files and you have one open, the next thing is
asking the AI to do something with it — see
[Getting the AI to help](getting-the-ai-to-help.md).
