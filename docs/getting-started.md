# Getting started

This page walks you from a fresh install through opening your writing,
choosing a profile, connecting an AI, and running your first action on a
paragraph. After this page you have a working setup; the other pages cover
individual parts of the app in more depth.

## Installing Canv

Pre-built installers are on the project's
[Releases page](https://github.com/skycubeuk/Canv/releases). Pick the one that
matches your machine:

- **macOS** — a disk image for Intel or Apple Silicon. The build is not yet
  signed, so the first time you launch it macOS refuses with a "cannot verify
  the developer" message. Right-click the app icon and choose **Open** to
  bypass that once; the system remembers the choice afterwards.
- **Windows** — an installer or a portable version. SmartScreen warns
  "publisher unknown" on first launch; click **More info → Run anyway**.
- **Linux** — an AppImage, or a `.deb` or `.rpm` package. Mark the AppImage
  executable before running it, or install the package with your package
  manager.

If a first-launch warning blocks you, [Troubleshooting](troubleshooting.md) has
the details for each system.

## Picking a workspace

The first time you launch Canv it asks you to pick a folder. This becomes your
**workspace**. Everything Canv shows you — the file tree, the editor, the AI's
view of "your work" — is rooted at that folder. Pick somewhere that already
holds the markdown files you want to write, or an empty folder you intend to
fill.

Canv only reads and writes inside the workspace you pick. You can change
workspace later, and Canv remembers each workspace's settings separately.

## First-time setup

When you open a workspace Canv hasn't seen before, a setup card appears. It
asks two things.

**Choose a default profile.** A profile is a flavour of writing — Fiction,
Factual, or Technical. Each profile carries its own set of one-click actions
(Grammar & Spelling, Make Shorter, Polish, and so on) and its own chat tone.
You can switch profile per document later, so this is just the starting profile
for new files in this workspace. The examples in this guide use Fiction.

**Turn on revision history.** If you tick this, Canv keeps a private, versioned
history of the whole workspace in the background. It is stored inside the
workspace folder and never touches your normal git work. Snapshots happen
automatically around AI edits and after idle periods, and you can make named
checkpoints by hand. See
[Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md)
for what the history can do for you.

Click **Set up workspace** and Canv writes the configuration and is ready.

## Connecting an AI

Canv does not ship with an AI account. To let the AI help, you either bring a
key from a cloud service — Canv supports Anthropic and OpenAI — or you run a
model locally on your own machine with Ollama, which needs no key.

The short version: open the settings tab, find the **API keys & endpoints**
section, and either paste a key for Anthropic or OpenAI, or point Canv at your
local Ollama server. The full walk-through, including how to pick which model
does the work, is on [Connecting an AI](connecting-an-ai-provider.md).

If you do not connect anything, the rest of the app still works — you can
write, organise, and read your files. The AI features show a "key missing"
warning until you connect a service.

## Writing something

Open a file from the file tree on the left, or create one with the **+**
buttons at the top of the tree. The main panel becomes a markdown editor: type
normally and your changes save to disk automatically. There is no separate
"save" step in routine writing.

The editor renders bold, italics, headings, and links as you type, so the file
you see and the file on disk match. When you want to read what you have written
without the markdown marks in view, the toolbar above the editor has an
**Edit / Preview** switch.

[More about the editor](writing-and-editing-text.md).

## Asking the AI for help

Once an AI is connected, select a paragraph in the editor. A small toolbar
floats next to the selection with the profile's actions — Grammar & Spelling,
Polish, Make Shorter, Free Edit, and so on. Click one. Canv sends just the
selected text (plus a little context about the rest of the document) to the AI
and streams the answer back. The response opens in a panel below your editor
with an inline diff between the original and the rewrite, and an **Apply**
button that drops the rewrite back into the document.

To run an action on the whole document instead of a selection, use the
**Run on document** menu in the same toolbar.

[More about asking the AI for help](getting-the-ai-to-help.md).

## Where to go next

- For a longer conversation rather than a one-off rewrite, see
  [Working with an AI assistant](working-with-an-ai-assistant.md).
- To know exactly when Canv saves things and what's tracked, see
  [Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).
- If something feels stuck, check [Troubleshooting](troubleshooting.md).
