# Working with an AI assistant alongside your draft

The selection and document actions on the previous page are short one-shot
requests. The chat is for longer conversations — asking questions about your
work, planning a revision, walking through a scene, having the assistant make
changes to files for you. This page covers how the chat works, how to point it
at a file, how it handles several conversations at once, what happens when it
wants to change a file, and how to choose which model is doing the work.

## Opening the chat

The chat lives in the bottom panel. If the panel is hidden, bring it up and pick
the **Chat** tab. The panel can sit at the bottom of the window, at the right of
the window, or in a separate window of its own — the placement control is in the
panel's header. The separate window is handy when you want the chat on a second
display while you write on the first.

The first time you open a chat in a workspace, Canv starts a conversation for
you. Type a message, send it, and the assistant replies. It has been given a
short instruction that matches your current profile — Fiction's assistant is a
craft-oriented writing partner, Factual's is a non-fiction editor, Technical's
is a documentation reviewer.

## What the assistant knows about your work

The assistant gets a short inventory of your workspace — the shape of the file
tree, the names of any pinned files, and the name of the file you have open. It
does not get the contents of every file up front. When it needs to read a file
it asks for it with a read tool, and Canv hands the file over without asking you
for permission. When the file it wants is the one you have open, Canv hands over
the live editor text rather than the disk version, so it sees your latest
unsaved edits. A pinned file from the tree rides along with every message on top
of all that; see
[Finding and organising your work](finding-and-organising-your-work.md).

## Pointing the assistant at a file

When you want the assistant to look at a particular file, you don't have to type
out its path. Type **@** in the message box and a file picker appears; start
typing to narrow it, then choose a file. Canv drops a short reference to that
file into your message. Send the message and the assistant reads the file it
points at with its tools. This is the quick way to say "compare @chapters/01.md
and @chapters/02.md for me" without remembering exactly where each file lives.

## Approving changes to your files

Most of the time the assistant just answers in prose. Sometimes it decides the
best way to help is to change a file — create a new note, edit your draft,
rename or move something, or delete a file you no longer need. When it does, an
**approval card** appears in the chat showing what it's about to do and a
preview of the change — the full diff for an edit, the contents for a new file,
the path for a rename or delete — and three buttons:

- **Approve** — let this one action go ahead.
- **Deny** — refuse this one action. The assistant is told you said no and
  decides what to do next.
- **Approve all remaining** — let this action and any further file changes in
  the rest of this turn through without prompting again. The bypass resets when
  the turn ends; the next message starts back at "ask for each one".

You decide every change. The assistant cannot write to your disk without an
approval, with one exception: when it's building or updating a small site under
the workspace's `.canv/sites/` area (covered in
[Building visual views of your project](building-visual-views-of-your-project.md)),
those writes are pre-approved, because a site is a dozen related files and
approving each one individually would be useless friction.

Read operations — listing a folder, reading a file, searching, looking at a
file's word count or structure — never ask. The assistant uses them freely to
learn about your workspace.

## Watching the assistant's plan

For multi-step jobs, the assistant posts a working **todo list** in the chat.
Each item has a status — pending, in progress, or done — and the assistant
updates the list as it works. You don't have to act on it; it's a way to see
what's been done and what's still to do without re-reading the whole
conversation.

## Stopping, retrying, and rewriting your last message

If the assistant is going in a direction you don't want, the **Stop** control
halts whatever it's doing — a streaming reply, in-flight tool calls, and pending
approvals all stop at once.

Every assistant message has a small row of actions beneath it. **Retry** runs
the same turn again from that point, regenerating only the most recent reply.
**Edit and retry** lets you rewrite your last message and run the turn again —
useful when your first try didn't quite say what you meant.

## Several conversations at once

The chat tab carries a list of conversations down the side. Each is independent
— its own history, its own model, its own plan. Create a new one from the **+**
button, switch between them by clicking, and close one you're done with.
Conversations are remembered per workspace, so they're still there when you open
the workspace tomorrow.

## Picking a model per conversation

Each conversation has a provider and model picker above the message box. Set it
before you send your first message; once a conversation is under way the model is
fixed for it, so a long exchange stays consistent. Different conversations can
use different models, and as long as you've connected the relevant providers a
chat picks up the right key automatically. If the chosen model has nothing
connected behind it, sending a message shows a "key missing" warning instead of
starting the turn. See [Connecting an AI](connecting-an-ai-provider.md).

## Connecting extra tools (advanced)

If you use external tool servers that follow the Model Context Protocol — a
shared standard for giving an assistant extra abilities — you can register them
in the settings tab's **MCP servers** section, and the assistant can call them
during a chat. This is an advanced option; you can ignore it entirely and the
chat works as described above.

## Up next

[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md) is
about the other place AI output lands — the result panel — and what to do with
it. [Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md)
covers the automatic safety captures Canv takes around every AI edit.
