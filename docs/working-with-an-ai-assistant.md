# Working with an AI assistant alongside your draft

The selection and document actions on the previous page are short
one-shot requests. The chat is for longer conversations — asking
questions about your work, planning a revision, walking through a
scene, having the AI make changes to files for you. This page covers
how the chat works, how it handles multiple conversations at once,
what happens when the AI wants to change a file, and how to choose
which model is doing the work.

## Opening the chat

The chat lives in the bottom panel. If the panel is hidden, bring it
up and pick the **Chat** tab. The panel can sit at the bottom of the
window, at the right of the window, or in a separate window of its own
— the placement control is in the top-right of the panel. The separate
window is useful when you want the chat on a second display while you
write on the first.

The first time you open a chat in a workspace, Canv starts a new
conversation for you. Type a message, send it, and the assistant
replies. The assistant has been given a short system prompt that
matches your current profile — Fiction's assistant is a craft-oriented
writing partner, Factual's is a non-fiction editor, Technical's is a
documentation reviewer.

## What the assistant knows about your work

The assistant gets a short inventory of your workspace — the file
tree, the names of pinned files, and the name of the file you have
open. It does not get the contents of every file. When it needs to
read a file it asks for it with a read tool, and Canv hands the file
over without asking you for permission.

When the file the assistant asks to read is the one you have open,
Canv hands over the live editor buffer rather than the disk version,
so the AI sees your latest unsaved edits.

A pinned file from the file tree rides along with every chat message
on top of all that. See
[Finding and organising your work](finding-and-organising-your-work.md)
for pinning.

## Approving file changes

Most of the time the assistant just answers in prose. Sometimes it
decides the best way to help is to change a file — create a new note,
edit your draft, rename or move something, or delete a file you no
longer need. When it does, an **approval card** appears in the chat
showing what it's about to do, a preview of the change (full diff for
edits, file contents for new files, the path for renames and deletes),
and three buttons:

- **Approve** — let this one action go ahead.
- **Deny** — refuse this one action. The assistant is told you said no
  and can decide what to do next.
- **Approve all remaining** — let this action and any further file
  changes in the rest of this turn through without prompting again.
  The bypass resets when the turn ends; the next conversation starts
  back at "ask for each one".

You decide every change. The assistant cannot write to your disk
without an approval, except in one specific case: when it's building or
updating a small site under `.canv/sites/` (covered in
[Building visual views of your project](building-visual-views-of-your-project.md)).
A site is typically a dozen related files; making you approve each one
individually would be useless friction, so writes inside `.canv/sites/`
are pre-approved.

Read operations — listing a folder, reading a file, searching, looking
at file metadata — never ask. The assistant uses them freely to learn
about your workspace.

## Watching the AI's plan

For multi-step jobs, the assistant can post a working **todo list** in
the chat. Each item has a status — pending, in progress, or done — and
the assistant updates the list as it works. The todo card lives in the
conversation; you don't have to act on it, but it's a useful way to
see what's been done and what's still to do without re-reading the
chat.

## Stopping, retrying, and rewriting your last message

If the assistant is going in a direction you don't want, the **Stop**
button halts whatever it's doing — including a streaming reply,
in-flight tool calls, and pending approvals.

Every assistant message has a small action row beneath it:

- **Retry** runs the same turn again from this point. The earlier
  exchange is preserved; only the most recent assistant turn is
  regenerated.
- **Edit and retry** lets you rewrite your last user message and run
  the turn again. Useful when your first prompt didn't quite say what
  you meant.

## Several conversations at once

The chat tab carries a list of conversations down the left. Each is
independent — its own history, its own model, its own todo state.
Create a new conversation from the **+** button at the top of the
list, switch between them by clicking, close one you're done with.

Sessions are remembered per-workspace. Open the workspace tomorrow and
your conversations are still there.

## Picking a model per conversation

Each conversation has a provider and model dropdown above the input
box. Changing it sets the model for any subsequent turn in that
conversation; it does not affect other conversations.

Canv reads which provider owns the model you picked, so as long as you
have keys for both Anthropic and OpenAI in settings, a single chat can
hop between providers. If the key for the chosen model isn't set,
sending a message shows a key-missing warning instead of starting the
turn.

## Watching the cost

A chat meter sits near the input box and accumulates the total tokens
and (rough) dollar cost for the current conversation as it runs. The
cost is local — Canv multiplies the token counts by pricing it stores
in settings — and is meant as a rough gauge rather than a billing
record.

## Up next

[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md)
is about the other place AI output lands — the runs panel — and what
to do with it. [Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md)
covers Canv's automatic safety captures around every AI turn.
