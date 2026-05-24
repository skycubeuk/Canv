# Finding and organising your work

A writing project is rarely a single file. This page covers moving around your
workspace — listing files, creating folders, jumping to a file by name,
searching for a phrase, reaching commands you don't see on screen, and pinning a
reference file so the AI always has it.

## Browsing the files in your workspace

The left side of the window lists every file and folder in your workspace. Click
a file to open it in the editor; click a folder to expand or collapse it. The
tree updates live when files change on disk, so creating a file outside Canv (in
another editor, with a script) makes it appear in the tree within a moment.

The header of the tree has two **+** buttons — one to create a new file in the
current folder, one to create a new folder. Right-click anywhere in the tree for
a menu with the rest of the operations:

- **New file** and **New folder** create children of the folder you clicked on
  (or the workspace root, if you clicked into empty space).
- **Rename** changes a file's or folder's name in place.
- **Delete** sends the file to the system trash. There is no in-app undo for a
  delete; the system trash is the way back. If revision history is on, you can
  also restore the file's last-known content from a snapshot — see
  [Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).
- **Pin to context** is offered on markdown files. A pinned file is included in
  every AI request from this workspace until you unpin it.
- **View history** is offered on markdown files when revision history is on. It
  opens the file's version list in a panel beneath the editor.
- **Serve as website** turns a folder into a small browsable site at a local
  address; see
  [Building visual views of your project](building-visual-views-of-your-project.md).

## Finding a file fast

When you know the file's name but not where it lives, there is a quick-find that
floats over the editor when you start typing a name. Canv ranks every file in
your workspace by how well it matches what you've typed; pick a result to open
it. The same overlay offers your recently-opened files at the top, so flipping
between two or three files you've been editing is quick.

## Searching the workspace

For finding a phrase rather than a filename, open the search tab in the left
sidebar. Type a query and Canv returns every match across the workspace, grouped
by file, up to a thousand matches in total. You can treat the query as a regular
expression (a pattern that matches by rule rather than literally),
make it case-sensitive, or scope it to a subfolder. Click a match to jump the
editor to that line.

Search skips binary files and very large files. For projects with thousands of
files the first search may take a moment as Canv reads them; after that the
results stream in as it finishes each file.

## Reaching commands you don't see

Canv has a command list that names every action — open settings, change
workspace, toggle the sidebar, run a particular profile action on the current
document, move the bottom panel to the right, and so on. Start typing to filter
it. It is the quickest way to reach something whose location you don't remember,
and it can also switch into a file-finding mode so the same overlay finds files
by name.

## Pinning a reference file

If you have a notes file or a series bible you want the AI to look at on every
turn, right-click the markdown file in the tree and choose **Pin to context**.
The pinned file rides along with whatever you ask the AI to do — selection
rewrites, document actions, chat replies — until you unpin it from the same
menu. The file shows a pin marker in the tree.

You can pin more than one file; they all attach to every AI turn. Pinning is
per-workspace, so each project keeps its own reference material attached. The
pin is only offered on markdown files.

## Up next

Once you can find your files and have one open, the next thing is connecting an
AI to work on them — see [Connecting an AI](connecting-an-ai-provider.md) — or,
if you've already done that, [Getting the AI to help](getting-the-ai-to-help.md).
