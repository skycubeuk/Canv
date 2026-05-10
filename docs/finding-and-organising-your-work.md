# Finding and organising your work

A writing project is rarely one file. This page covers how to move
around a folder full of markdown, how to find a particular file or a
particular phrase, and how to give the AI background reading so it
understands the world you're writing in.

## Browsing the folder

The left side of the window shows your workspace as a tree of folders
and markdown files. Click a folder to expand it; click a file to open
it. The active file is highlighted; files you've opened recently are
listed first when you go looking by name (more on that in a moment).

Right-click any file or folder for a menu of file-management actions:

- **New file** and **New folder** create them inside the folder you
  right-clicked.
- **Rename** lets you type a new name in place. Press Enter to confirm,
  Escape to cancel.
- **Delete** removes the file or folder from disk. Canv asks for
  confirmation first.

You can drag a file from your operating system's file manager into the
sidebar; Canv copies it into the workspace.

The breadcrumb above the writing area shows where the current file
lives. Click any folder name in the breadcrumb to jump to it in the
tree.

## Finding any file fast

If you can't remember exactly where a file lives but you remember part
of its name, open the quick file finder. A small search box appears in
the middle of the screen. Start typing — the list narrows to files whose
path matches what you typed, scored by closeness. Use the up and down
arrows to pick one, then Enter to open it. Escape closes the box without
doing anything.

When you open the finder without typing, it shows files you've opened
recently — useful for jumping back to something from this morning.

## Searching every file

The quick finder above looks at filenames. If you need to find a phrase
or pattern *inside* files, use the search section in the top-left of
the window (the magnifying glass).

Type a phrase. Canv lists every file with a match, with the matching
line in context. Click a match to jump straight to it in the writing
area.

You can:

- Make the search **case-sensitive** with the toggle next to the
  field.
- Treat your query as a **regular expression** (a pattern, not just a
  literal string).
- Restrict the search to a **folder** by typing the folder's relative
  path in the folder field.

If a file would have an absurd number of matches, Canv tells you the
results were truncated and shows the first batch.

## Working over an SSH connection

Canv can open a folder that lives on another computer, as long as you
can reach it over SSH. Open the workspace switcher and choose **Open
Remote Workspace**, then type a target like
`username@host:/path/to/folder`. A list of recent connections appears
below the input so you don't have to retype them.

Once connected, the workspace works as it would locally: files in the
tree, search, the AI actions. The status bar shows a small **remote**
badge so you don't forget where the writing actually lives.

This is experimental. If something's slow or odd, working locally is
the smoother experience.

## Pinning a file as background reading for the AI

When you ask the AI to rewrite a paragraph, it sees the paragraph plus
whatever you've pinned. Pinning is how you teach the AI about your
project without retyping the same notes into every prompt — character
sketches, the world's rules, an outline, a style guide.

Right-click any file in the tree and choose:

- **Pin as summary** — the AI will see this file's contents but won't
  treat it as text under revision. Use this for reference notes.
- **Pin as full text** — same as above; the file is included in full.

Pinned files have a pin icon next to their name in the tree. Right-click
again to unpin.

A few useful patterns:

- For a novel: pin a `characters.md` and an outline. Every rewrite
  sees the same canon.
- For technical writing: pin the spec or the API reference you're
  documenting.
- The file you're currently editing is implicitly the subject of any
  agent run, so you don't need to pin it.

Pinned files travel with the workspace, not with Canv — open the same
folder on another machine and your pins are still there.

Next: [Getting the AI to help with a passage](getting-the-ai-to-help.md).
