# Writing and editing text

This page is about the middle of the window — where your prose lives. It
covers what the editor does on its own, how to format selected text, how
to switch between editing and a rendered preview, how to jump around long
documents, and how to keep two files visible at once.

## How the editor behaves

The editor is a markdown editor that renders formatting as you type.
Bold, italic, strikethrough, headings, lists, links and inline code all
appear with their visible style applied; the markdown syntax stays in
the file but the editor decorates it so you can read your prose without
the asterisks getting in the way.

Your changes save to disk automatically. There is no "unsaved" state to
worry about in normal use — Canv writes the file in the background as
you type, with a short pause to coalesce edits. If something else on the
system also changes the file (another editor, a sync tool, a script),
Canv notices and offers you a choice: reload from disk, or overwrite the
disk version with what is in your editor. See
[Troubleshooting](troubleshooting.md) for what to do if that prompt
appears.

The default theme is dark. If you prefer light, open the settings tab,
find the **Appearance** section, and switch the theme there.

## Formatting selected text

Select any run of text in the editor and a small toolbar appears next to
the selection. The first row holds formatting controls — bold, italic,
strikethrough, inline code, headings, bulleted and numbered lists, block
quote, code block, and a link inserter. Click one and Canv applies the
markdown syntax around your selection.

The same floating toolbar also contains profile actions (Polish, Make
Shorter, Brainstorm, and so on). Those are covered in
[Getting the AI to help](getting-the-ai-to-help.md).

## Reading the rendered page

The toolbar above the editor has an **Edit** / **Preview** switch. In
Preview mode the markdown is rendered as a clean reading page —
headings styled, lists formatted, links live — without any syntax in
view. The preview is for reading; you cannot type into it. Flip back
to Edit to keep writing.

The preview re-renders when you flip into it, so changes you make in
Edit appear when you switch back. Headings in the preview are clickable
and jump straight to that heading in the editor when you switch back.

## Jumping by heading

A long document is easier to navigate by structure than by scrolling.
The outline panel on the right of the editor lists every heading in the
current file as a collapsible tree. Click a heading to jump the editor
to it. Headings update live as you type — if you rename a section, the
outline catches up.

If the outline panel is hidden, the sidebar footer has a control to
bring it back.

## Working with two files at once

You can split the editor area into two columns and open a different file
in each. Use the editor's split control (next to the tab strip) to
create a second column on the right; drag a tab from one column to the
other to move files between them, or open a file from the file tree
while the second column is focused.

To go back to a single column, close the tabs in one of the columns or
close the column entirely.

## Pinning a reference file

If you have a notes file or a series bible you want the AI to look at on
every turn, right-click the file in the file tree and choose **Pin to
context**. The pinned file is included alongside whatever you ask the
AI to do — selection rewrites, document actions, chat replies — until
you unpin it from the same menu. Pinning is per-workspace, so each
project can keep its own reference material attached.

The pin only applies to markdown files; non-markdown files do not show
the pin menu entry.

## Exporting a finished file

Canv's files are already plain markdown on your disk, so "exporting" is
mostly a matter of getting a copy out. The command palette has two
exports for the current file:

- **Export as .md** — saves the file's markdown to a location you pick.
- **Export as .txt** — saves the file as plain text without the markdown
  syntax.

Both produce a fresh copy; the file in your workspace is unaffected.

## Up next

If you want to find a file you can't remember the name of, or you want
the AI to always see a particular reference document, see
[Finding and organising your work](finding-and-organising-your-work.md).
