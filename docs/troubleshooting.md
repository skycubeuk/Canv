# Troubleshooting

Most things in Canv just work. The few that catch people out are
usually first-launch security warnings on each OS, a missing API key,
or another tool changing a file while Canv has it open. This page
covers each of those, plus a few smaller things that come up.

## First launch warns about the developer or publisher

Canv builds are not yet code-signed, so each operating system shows a
warning the first time you open the app:

- **macOS** — "cannot verify the developer of Canv". Right-click the
  app and pick **Open** to bypass once; macOS remembers your choice.
- **Windows** — SmartScreen says "publisher unknown". Click **More
  info → Run anyway**.
- **Linux** — no warning on AppImage (mark it executable first) or
  the `.deb` / `.rpm` packages.

There is nothing wrong with the build; this is what every unsigned
Electron app sees on a fresh system. Signing is on the roadmap.

## The AI features show "API key missing"

Canv does not ship with an AI account. The selection actions, the
document actions, and the chat all need a provider key.

Open the settings tab and find the **Providers** section. Paste the
key from your Anthropic or OpenAI account into the matching field. The
field saves on blur — no separate save step — and the warning clears
within a moment.

Keys live in your local app settings. Canv has no server that sees
them. The app talks to `api.anthropic.com` or `api.openai.com` from
your own machine.

## A file changed on disk while I had it open

When something other than Canv writes to a file you have open — a sync
tool, a script, another editor — a prompt appears asking you what to
do:

- **Reload** discards what's in your editor and loads the disk
  version.
- **Overwrite** writes your editor's content over the disk version,
  losing the external change.

Pick whichever side is the one you want to keep. If you're not sure,
the safest thing is to reload — your previous editor content is
recoverable from Canv's history if it is turned on.

The same prompt does **not** appear when Canv itself made the change
(an AI tool edit, a restore from history, a save you just performed).
Those are recognised as your own writes.

## The History sidebar tab isn't there

The **History** tab appears only when revision history is turned on
for the workspace. If you said no during first-time setup and want it
now, close the workspace folder and open it again; the setup card
runs on a workspace with no configuration.

History also does not work on remote (SSH) workspaces in this release.
The setup card disables the option in that case.

## I want to use a workspace on a remote server

Canv has experimental support for opening a workspace over SSH. The
editor still runs on your local machine; the files live on the
server, and Canv proxies reads and writes over the connection.

From the workspace switcher, pick **Open remote workspace** and enter
the SSH details. The connection is held open in a small pool so the
editor stays responsive.

Limitations to be aware of in this release:

- Revision history is not available for remote workspaces. The setup
  card disables the toggle.
- The first listing of a large remote folder can take noticeably
  longer than a local one.
- If the connection drops, Canv pauses writes until you reconnect from
  the status indicator.

If a remote workspace doesn't work for you, the underlying file
synchronisation tools (rsync, sshfs, your file sync of choice) and a
local Canv workspace on the synchronised folder is the supported
fallback.

## The AI keeps stopping to ask permission

Every time the AI wants to create, edit, rename, or delete a file in
your workspace it asks for your approval. This is by design — the AI
should not be able to silently modify your work.

If a particular turn will involve a lot of file changes (a sweeping
refactor, building a site, batch renaming), the approval card has an
**Approve all remaining** button. It lets every subsequent file change
in that turn through without prompting. The bypass resets at the end
of the turn, so the next conversation starts back at "ask for each
one".

Read-only operations — listing folders, reading files, searching —
never prompt. Site-building writes under `.canv/sites/` are
pre-approved (see
[Building visual views of your project](building-visual-views-of-your-project.md)).

## A streaming reply has stuck

If the AI's reply stops moving and the panel still shows a "running"
state, the **Stop** control in the chat halts everything immediately —
the streaming reply, in-flight tool calls, pending approvals. After
stop you can retry the last message or edit-and-retry from the chat
toolbar.

## I get unexpected results when restoring a file

Restore takes a safety capture (a snapshot tagged "before rollback")
right before it overwrites the file. If a restore was wrong, open the
**History** tab — the safety capture is at the top of the timeline
with a **Before rollback** badge — and restore the file from that one
to undo the undo.

## I want to undo a delete from the file tree

The file tree's **Delete** option sends the file to the system trash.
That is the way back: open your OS trash and put the file back.

If revision history is on, the file's last-known content is also
inside the most recent snapshot. Right-click the (now-missing) file
inside an open snapshot's expansion and pick **Restore** to write it
back. The same flow works for files that were deleted before history
was turned on — they're not recoverable from Canv in that case.

## Something else feels wrong

The repo's [issue tracker](https://github.com/skycubeuk/Canv/issues)
is the right place to report a problem. Include your Canv version
(it's at the bottom of the settings tab), the OS you're on, and what
you were doing when the issue happened.

## Up next

If you've come this far in the guide and you want a reminder of what
each page is for, the [index](README.md) lists them all.
