# Adding features to Canv

Canv can be extended with small add-ons that bolt extra features onto the app —
new panels, viewers for file types Canv doesn't handle on its own, extra
commands, and more. These add-ons are called **extensions**. This page covers
what they can add, installing one, and the trust steps that keep an extension
from running until you allow it.

## What an extension can add

An extension can contribute any of six kinds of thing:

- **Panels** — a new panel in the left sidebar or the bottom dock.
- **File viewers and editors** — a way to open and work with a file type Canv
  doesn't handle on its own.
- **Language support** — syntax handling for a particular kind of file.
- **Commands** — actions that show up in the quick-find over the editor.
- **File-tree menu items** — extra entries on the right-click menu in the file
  tree.
- **Status-bar widgets** — a small readout or control in the bar along the
  bottom.

Panels in the bottom dock also appear when you pop the dock out into its own
window.

## Installing an extension

Extensions install per workspace, from the Extensions tab. You can install one
from a folder or from a packaged file. Before it installs, Canv shows you what
the extension is asking for:

- Its **capabilities** — what it wants permission to do, such as writing to your
  workspace, changing the open document, using the AI, or reaching the network.
  The more far-reaching ones are called out.
- The **network hosts** it may contact, if any.
- A clear warning if it wants to take over a file type.

Read that disclosure before you accept it — it's the whole point of the step.

## Trust keeps extensions from running on their own

Opening someone else's workspace never runs their extensions silently. Two things
have to be true before an extension's code runs: you've **trusted the
workspace**, and you've **trusted that extension**. Until both are in place, an
extension stays inert. This means you can open a project from elsewhere, look at
what's in it, and decide before anything runs.

## Managing installed extensions

From the Extensions tab you can enable or disable an extension, reload one after
it's been updated, and uninstall ones you no longer want. Each shows its current
state and its trust status, and you can revoke trust at any time.

## Up next

If something isn't behaving — an extension, a key, or a file that changed
underneath you — see [Troubleshooting](troubleshooting.md).
