# Adding features to Canv

Canv can be extended with small add-ons that bolt extra features onto the app —
new panels, viewers for file types Canv doesn't handle on its own, extra
commands, and more. These add-ons are called **extensions**. This page covers
what an extension can add, how you install and manage one, and the trust step
that keeps an extension from running until you've decided to allow it.

An extension is a small bundle of code that someone has written to add a feature
to Canv. You install it into a workspace, and it only affects that workspace.
Because an extension runs code, Canv won't let one do anything until you've
explicitly trusted it — more on that below.

## What an extension can add

An extension can contribute any of these to the app:

- **A panel** — a new tab in the left sidebar or in the bottom panel, with its
  own interface.
- **A viewer or editor for a file type** — so a file Canv would otherwise treat
  as plain text (a PDF, a spreadsheet-style file) opens in something purpose-built.
- **Editing support for a file format** — colouring and structure for a kind of
  file Canv doesn't recognise on its own.
- **A command** — a new entry in the command list you can run by name.
- **A menu item** — an extra option in the file tree's right-click menu.
- **A status-bar widget** — a small indicator at the bottom of the window.

## Finding the extensions you've installed

The left sidebar has an **Extensions** tab. It lists every extension installed in
the current workspace, with a switch to turn each one on or off and a menu for
the rest of the operations. A freshly opened workspace has none until you add
one. Extensions live inside the workspace folder, so a different workspace starts
with its own (empty) list.

## Installing an extension

In the Extensions tab, use the **+** button. You can install from a folder on
your disk, or from a single packaged extension file. Either way, before anything
is installed Canv shows you a summary card describing what the extension adds —
including its **capabilities** (what it's asking permission to do, such as
reading your open document, writing to the workspace, or reaching the network)
and any **network addresses** it wants to contact. Capabilities that can change
your files or reach the internet are highlighted so they're hard to miss. If the
extension adds editing support for a file format, Canv shows an extra warning,
because that kind of add-on runs with broader reach. Read the card, and if you're
comfortable, confirm the install.

## Trusting an extension before it runs

Installing an extension does not, by itself, let it run. Canv gates extensions
behind trust, in two layers:

- **Workspace trust.** When you open a workspace that contains extensions, a
  banner tells you how many it found and that they won't run until you trust the
  workspace. You can trust the workspace, or choose to keep extensions disabled
  for it.
- **Per-extension trust.** Even in a trusted workspace, each extension has to be
  trusted individually before its on/off switch will turn it on. An untrusted
  extension shows a marker; its menu has a **Trust this extension** option, and a
  matching option to revoke that trust later.

This two-step gate means opening someone else's workspace, or pulling in a folder
of files that happens to contain extensions, never silently runs code on your
machine.

## Managing extensions

Each extension's row in the Extensions tab has:

- An **on/off switch** to enable or disable it. A disabled extension stays
  installed but doesn't run.
- A menu with **Trust** / **Revoke trust**, **Reload** (useful if it has
  misbehaved — a crashed extension shows a warning you can reload past), and
  **Uninstall** to remove it from the workspace entirely.

## Up next

If an installed extension isn't showing its panel or command, the most likely
cause is the trust step — check the banner and the per-extension trust marker
described above. Other common snags are in [Troubleshooting](troubleshooting.md).
