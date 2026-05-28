# Working with an AI assistant

The passage actions are short, one-shot requests. The chat is for longer
work — asking questions about your draft, planning a revision, or having the
assistant make changes across several files. This page covers chatting alongside
your writing, pointing the assistant at a file, running more than one
conversation, and approving the changes it wants to make.

## Chatting alongside your draft

Open the chat and type to the assistant the way you would to a person who can see
your project. It knows about your workspace and can read your files to answer, so
you can ask things like "is the timeline in chapter three consistent with chapter
one?" without pasting anything in. The conversation scrolls as it goes, and there
is a jump-to-latest control for when you've scrolled back to read something.

## Pointing the assistant at a file

To refer to a particular file in a message, type `@` and start its name. A short
list of matching files appears; pick one and a reference to it drops into your
message. Use it when you want the assistant to look at something specific —
"compare this draft to @outline.md". For a file you want it to keep in mind for
every message, pin it instead; see
[Finding and organising your work](finding-and-organising-your-work.md).

## Running several conversations

You can keep more than one chat going — one for plotting, one for line edits,
say. Start a new conversation, switch between them from the list, and close ones
you're done with. Each conversation shows when it's busy and flags when it's
waiting on you to approve something.

Each conversation picks its own provider and model at the start, and keeps them
once it's under way, so a long exchange stays consistent. See
[Connecting an AI](connecting-an-ai-provider.md) for the choices.

## Approving changes to your files

The assistant can change your files — write a new one, edit an existing one, or
rename and delete things — but it never does so silently. When it wants to make a
change, an **approval card** appears in the chat showing what it's about to do
and a preview: the full diff for an edit, the contents for a new file. You then
choose:

- **Approve** — let this one change go ahead.
- **Deny** — refuse it; the assistant carries on without making it.
- **Approve all remaining** — let this change and any further ones in the same
  turn proceed without asking again, for when you've decided to trust where it's
  going.

Reading and searching your files never needs approval — only changes do.
Deleting a file can't be undone by the assistant, so that one is worth a careful
look before you approve. When the assistant edits the file you have open, the
change goes into the editor rather than straight to disk, and is written out when
you save as normal.

One thing is pre-approved: when the assistant builds a small website inside your
workspace, the files that make up that site go in without a prompt for each one,
because a site is a dozen related files at once. That feature is covered in
[Building visual views of your project](building-visual-views-of-your-project.md).

## Watching the plan

For anything with several steps, the assistant can lay out a plan as a checklist
in the chat and tick items off as it works, so you can see what it intends to do
and how far it's got.

## Giving the chat more room

The chat lives in a dock that you can move to the side or the bottom, or pop out
into its own window when you want it bigger or on a second screen. Fold it back
into the main window from the popped-out window's header.

## Up next

Everything the assistant changes is captured in your workspace history — see
[Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).
