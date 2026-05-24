# Troubleshooting

Most things in Canv just work. The few that catch people out are usually
first-launch security warnings on each operating system, a missing AI key, or
another tool changing a file while Canv has it open. This page covers each of
those, plus a few smaller things that come up.

## First launch warns about the developer or publisher

Canv builds are not yet code-signed, so each operating system shows a warning the
first time you open the app:

- **macOS** — "cannot verify the developer of Canv". Right-click the app and pick
  **Open** to bypass once; macOS remembers your choice.
- **Windows** — SmartScreen says "publisher unknown". Click **More info → Run
  anyway**.
- **Linux** — no warning on the AppImage (mark it executable first) or the
  packaged installs.

There's nothing wrong with the build; this is what every unsigned app sees on a
fresh system.

## The AI features show "key missing"

Canv doesn't ship with an AI account. The selection actions, the document
actions, and the chat all need an AI connected. Open the settings tab, find the
**API keys & endpoints** section, and either paste a key for Anthropic or
OpenAI, or point Canv at a local Ollama server. The warning clears within a
moment. Full instructions, including running a free local model, are on
[Connecting an AI](connecting-an-ai-provider.md). Your keys are stored on your
own machine; Canv has no server that sees them.

## A file changed on disk while I had it open

When something other than Canv writes to a file you have open — a sync tool, a
script, another editor — a prompt asks what to do:

- **Reload** discards what's in your editor and loads the disk version.
- **Overwrite** writes your editor's content over the disk version, losing the
  external change.

Pick whichever side you want to keep. If you're not sure, reloading is safest —
your previous editor content is recoverable from Canv's history if it's turned
on. This prompt does **not** appear when Canv itself made the change (an AI edit,
a restore from history, a save you just performed); those are recognised as your
own writes.

## The History tab isn't there

The **History** tab appears only when revision history is turned on for the
workspace. If you said no during first-time setup and want it now, close the
workspace folder and open it again; the setup card runs on a workspace with no
configuration, and you can tick **Revision Archaeology** then. See
[Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).

## The AI keeps stopping to ask permission

Every time the assistant wants to create, edit, rename, or delete a file in your
workspace, it asks for your approval. This is by design — the assistant should
not be able to silently change your work. If a particular turn will involve a lot
of file changes (a sweeping revision, building a view, batch renaming), the
approval card has an **Approve all remaining** button that lets the rest of that
turn's changes through without prompting. The bypass resets at the end of the
turn. Read-only operations — listing folders, reading files, searching — never
prompt, and site-building writes under `.canv/sites/` are pre-approved (see
[Building visual views of your project](building-visual-views-of-your-project.md)).

## A streaming reply has stuck

If the AI's reply stops moving and the panel still shows a running state, the
**Stop** control in the chat halts everything immediately — the streaming reply,
in-flight tool calls, and pending approvals. After stopping, you can retry the
last message or edit-and-retry from the chat.

## An extension's panel or command isn't showing

Extensions don't run until you've trusted them. Open the **Extensions** tab: if a
banner says the workspace contains extensions that won't run until trusted, trust
the workspace. Then check the extension's own row — it has to be trusted
individually and switched on before its features appear. See
[Adding features to Canv](adding-features-to-canv.md).

## I get unexpected results when restoring a file

Restore takes a safety capture (a snapshot tagged "before rollback") right before
it overwrites the file. If a restore was wrong, open the **History** tab — the
safety capture is at the top of the timeline with a **Before rollback** badge —
and restore the file from that one to undo the undo.

## I want to undo a delete from the file tree

The file tree's **Delete** option sends the file to the system trash. That's the
way back: open your system trash and put the file back. If revision history is
on, the file's last-known content is also inside the most recent snapshot —
right-click the now-missing file inside an open snapshot's expansion and pick
**Restore** to write it back. Files deleted before history was turned on aren't
recoverable from Canv.

## Something else feels wrong

The repo's [issue tracker](https://github.com/skycubeuk/Canv/issues) is the right
place to report a problem. Include your Canv version (it's shown on Canv's
welcome screen when no workspace is open), the operating system you're on, and
what you were doing when the issue happened.

## Up next

If you've come this far and want a reminder of what each page is for, the
[index](README.md) lists them all.
