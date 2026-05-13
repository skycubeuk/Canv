# Getting started

This page walks you from a fresh install through opening your writing,
choosing a profile, adding an AI key, and running the AI on a paragraph.
After this page you have a working setup; the other pages cover individual
parts of the app in more depth.

## Installing Canv

Pre-built installers are on the project's
[Releases page](https://github.com/skycubeuk/Canv/releases). Pick the one
that matches your machine:

- **macOS** — `.dmg` for Intel or Apple Silicon. The build is currently
  unsigned, so the first time you launch it macOS will refuse with a
  "cannot verify the developer" message. Right-click the app icon and
  choose **Open** to bypass that once, and the system will remember the
  choice afterwards.
- **Windows** — NSIS installer or a portable `.exe`. SmartScreen warns
  "publisher unknown" on first launch; click **More info → Run anyway**.
- **Linux** — `.AppImage`, `.deb`, or `.rpm`. Mark the AppImage executable
  before running it, or install the `.deb`/`.rpm` with your package manager.

System requirements: macOS 10.15 or later, Windows 10 or later, glibc 2.28
or later on Linux.

## Picking a workspace

The first time you launch Canv it asks you to pick a folder. This becomes
your **workspace**. Everything Canv shows you — the file tree, the editor,
the AI's view of "your work" — is rooted at that folder. Pick somewhere
that already holds the markdown files you want to write, or an empty folder
you intend to fill.

Canv only reads and writes inside the workspace you pick. You can change
workspace later from the workspace switcher, and Canv remembers each
workspace's settings separately.

## First-time setup

When you open a workspace Canv hasn't seen before, a setup card appears.
It asks two questions.

**Choose a default profile.** A profile is a flavour of writing — Fiction,
Factual, or Technical. Each profile carries its own set of one-click
actions (Grammar & Spelling, Make Shorter, Polish, and so on) and its own
chat tone. You can switch profile per document later, so this is just the
starting profile for new files in this workspace. The examples in this
guide use Fiction.

**Turn on revision history.** If you tick this, Canv keeps a private,
versioned history of the whole workspace in the background. It is stored
inside the workspace folder under `.canv/` and never touches your normal
git branch or index — Canv writes to its own dedicated branch called
`canv-history`. Snapshots happen automatically (before and after each AI
edit, after long idle periods with unsaved changes) and you can make
named checkpoints by hand. See
[Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md)
for what the history can do for you.

Click **Set up workspace** and Canv writes the configuration file and is
ready.

## Adding an AI key

Canv does not ship with an AI account. To let the AI help, you bring your
own key from a provider — Canv supports Anthropic and OpenAI.

Open the settings tab and find the **Providers** section. Paste your key
for whichever provider you want to use, pick a default model, and the
field saves on blur. Keys are stored in the app's local settings, on your
machine; Canv has no backend that sees them.

If you do not add a key, the rest of the app still works — you can write,
organise, and read your files. The AI features show an "API key missing"
warning until a key is set.

## Writing something

Open a file from the file tree on the left, or create one with the **+**
buttons at the top of the tree. The main panel becomes a markdown editor:
type normally and your changes save to disk automatically. There is no
separate "save" step in routine writing.

Canv's editor renders bold, italics, headings, and links as you type so
the file you see and the file on disk match. When you want to read what
you have written without the markdown syntax in view, the toolbar above
the editor has an **Edit / Preview** switch — flipping to Preview shows
the rendered page; flipping back returns to the editor.

[More about the editor](writing-and-editing-text.md).

## Asking the AI for help

Once a provider key is set, select a paragraph in the editor. A small
toolbar floats next to the selection with the profile's actions —
Grammar & Spelling, Polish, Make Shorter, Free Edit, and so on. Click
one. Canv sends just the selected text (plus a little context about
the rest of the document) to the AI and streams the answer back. The
response opens in a panel below your editor with an inline diff between
the original and the rewrite, and an **Apply** button that drops the
rewrite back into the document at the same place.

To run an action on the whole document instead of a selection, use the
**Run on document** menu in the same toolbar.

[More about asking the AI for help](getting-the-ai-to-help.md).

## Where to go next

- If you want a longer conversation rather than a one-off rewrite, see
  [Working with an AI assistant](working-with-an-ai-assistant.md).
- If you want to know exactly when Canv saves things and what's tracked,
  see [Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).
- If something feels stuck, check [Troubleshooting](troubleshooting.md).
