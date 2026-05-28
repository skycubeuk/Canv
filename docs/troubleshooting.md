# Troubleshooting

Most things in Canv just work. The few that catch people out are usually a
first-launch security warning, a missing AI key, or another program changing a
file while Canv has it open. This page covers each, and where to turn when
something feels stuck.

## "Canv can't be opened" on macOS

The macOS build is unsigned, so the first time you open it the system may refuse,
saying it can't check the app for malware. This is the warning every unsigned app
gets; it isn't about Canv specifically. Right-click the app in Finder and choose
**Open** — you'll get the same warning but with an Open button this time. Do that
once and macOS remembers; afterwards it launches normally.

## A warning on Windows

On Windows, the installer may show a blue "Windows protected your PC" screen
because the build isn't signed. Choose **More info** and then **Run anyway** to
continue. As on macOS, this is the generic unsigned-app warning.

## The AI isn't doing anything

If the AI actions or the chat seem to do nothing, the usual cause is that no
provider is connected, or the one you picked has no key. Open the settings tab
and check that you've added a key for a cloud provider, or that your local Ollama
address is reachable and its models have been refreshed. The model picker only
lists providers and models you've actually set up, so an empty picker means
there's nothing connected yet. See [Connecting an AI](connecting-an-ai-provider.md).

## A file changed underneath you

If another program edits a file while you have it open in Canv — a sync tool, or
your own edits in another editor — Canv notices and asks what you want to do:
reload the file from disk and lose your in-editor changes, or keep what's in the
editor and overwrite the version on disk when you next save. Pick whichever holds
the version you want to keep.

This is also why, when the assistant edits the file you have open, the change
goes into the editor first and only reaches disk when you save — so you always
get the last word.

## An extension isn't running

If an extension you installed doesn't seem to do anything, check that you've
trusted both the workspace and the extension itself, and that the extension is
enabled. Until all three are true it stays inert by design. See
[Adding features to Canv](adding-features-to-canv.md).

## When something feels stuck

If the app gets into an odd state — a panel that won't redraw, an action that
seems hung — reloading the window or restarting Canv usually clears it without
touching your files, since your work is saved as ordinary files in your workspace
folder. If a problem keeps happening, note what you did just before it and how to
reproduce it, which is the most useful thing to have when reporting it.
