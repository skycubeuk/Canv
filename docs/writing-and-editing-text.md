# Writing and editing text

This page is about the middle of the window — where your prose lives. It covers
what the editor does on its own, how to format selected text, how to switch
between editing and a rendered preview, how to move around long documents, how
to keep two files visible at once, and how to change the way the app looks.

## How the editor behaves

The editor is a markdown editor that renders formatting as you type. Bold,
italic, strikethrough, headings, lists, links and inline code all appear with
their visible style applied; the markdown marks stay in the file but the editor
decorates them so you can read your prose without the asterisks getting in the
way.

Your changes save to disk automatically. There is no "unsaved" state to worry
about in normal use — Canv writes the file in the background as you type, with a
short pause to gather up edits. If something else on the system also changes the
file (another editor, a sync tool, a script), Canv notices and offers you a
choice: reload from disk, or keep what is in your editor. See
[Troubleshooting](troubleshooting.md) for what to do if that prompt appears.

## Formatting selected text

Select any run of text in the editor and a small toolbar appears next to the
selection. The first row holds formatting controls — bold, italic,
strikethrough, inline code, headings, bulleted and numbered lists, block quote,
code block, and a link inserter. Click one and Canv wraps your selection in the
matching markdown.

The same floating toolbar also carries the profile's AI actions (Polish, Make
Shorter, Brainstorm, and so on). Those are covered in
[Getting the AI to help](getting-the-ai-to-help.md).

## Reading the rendered page

The toolbar above the editor has an **Edit / Preview** switch. In Preview the
markdown is rendered as a clean reading page — headings styled, lists formatted,
links live — with no marks in view. The preview is for reading; you cannot type
into it. Flip back to Edit to keep writing.

The preview re-renders when you flip into it, so changes you make in Edit appear
when you switch back. Headings in the preview are clickable and jump straight to
that heading in the editor.

## Jumping by heading

A long document is easier to navigate by structure than by scrolling. The
outline panel beside the editor lists every heading in the current file as a
collapsible tree. Click a heading to jump the editor to it. Headings update live
as you type — rename a section and the outline catches up.

## Working on two files at once

You can split the editor area into two columns and open a different file in
each. Use the editor's split control, next to the row of open-file tabs, to
create a second column; drag a tab from one column to the other to move files
between them, or open a file from the tree while the second column is focused.

To go back to a single column, close the tabs in one column or close the column
entirely.

## Changing the theme and text size

The default theme is dark. If you prefer something else, open the settings tab
and find the **Appearance** section. The theme picker offers a range of dark
themes (including the default, plus Dracula, Nord, Tokyo Night, Gruvbox,
Solarized Dark, and Synthwave '84) and several light ones (a plain light theme,
Alucard, Solarized Light). There is also a **Match system** option that follows
whether your operating system is set to light or dark.

The same Appearance section lets you set the editor's text size and the chat's
text size independently. A separate **Editor** section sets how wide a line of
text runs — narrow, normal, or wide — which is useful for keeping long
paragraphs to a comfortable reading measure.

## Exporting a finished file

Canv's files are already plain markdown on your disk, so "exporting" is mostly a
matter of getting a copy out. There are two exports for the current file,
reachable from the command list described in
[Finding and organising your work](finding-and-organising-your-work.md):

- **Export as .md** — saves the file's markdown to a location you pick.
- **Export as .txt** — saves the file as plain text without the markdown marks.

Both produce a fresh copy; the file in your workspace is unaffected.

## Up next

To find a file you can't remember the name of, or to keep a reference document
in front of the AI on every turn, see
[Finding and organising your work](finding-and-organising-your-work.md).
