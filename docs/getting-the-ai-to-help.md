# Getting the AI to help with a passage

Canv's editing actions are short, focused requests — "rewrite this paragraph",
"tell me what's wrong with this scene", "make this section shorter without
losing the voice". You pick the text, click an action, and the answer arrives in
a panel below the editor for you to look at before deciding what to keep. This
page covers running those actions, the difference between running on a selection
and on a whole document, and how the profile you've chosen changes what's on
offer.

## Running an action on a selection

Select any run of text in the editor. A floating toolbar appears next to your
selection with the profile's selection actions — for Fiction these are Grammar
& Spelling, Polish, Make Shorter, Make Longer, Simplify, More Sophisticated,
Brainstorm, and so on. Click one. Canv sends just the selected text (plus a few
short lines of surrounding context) to the AI and streams the reply into a panel
at the bottom of the window.

Two of the selection actions ask you for a short instruction before they run —
**Free Edit** (which does whatever you tell it) and **Refine** (a follow-up note
against the result). When you click one, the toolbar opens a small text box;
type your instruction and submit.

The panel that opens beneath the editor shows the AI's notes about what it found
and, where the action produces one, the rewrite itself with an inline diff
against your original. The next page,
[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md),
covers what to do with that result.

## Running an action on the whole document

Some actions are about the document as a whole — for Fiction, Story Reviewer,
Logic Checker, and Test Reader read the entire file and give you feedback rather
than a rewrite. These appear in the **Run on document** menu at the end of the
floating toolbar. With nothing selected, pick an action from that menu and the
AI receives the full document instead of a fragment.

Document actions stream into the same panel as selection actions. Because they
read the whole file, they take longer than a paragraph rewrite — the panel shows
the response forming live so you can start reading before it finishes. You can
also reach every document action by name from the command list described in
[Finding and organising your work](finding-and-organising-your-work.md).

## Switching profile

The set of actions on the toolbar comes from the **profile** you've picked. Canv
ships with three:

- **Fiction** — stories, novels, short pieces, scene work. Actions are tuned to
  preserve voice, character, and pacing.
- **Factual** — essays, articles, reports, blog posts. Actions are tuned for
  general non-fiction prose.
- **Technical** — documentation, specs, how-tos, references. Actions are tuned
  for precision and consistency.

The current profile is named in the bottom status bar. Click it to switch.
Switching changes the toolbar's action set, the chat assistant's tone, and the
instructions that go with every AI request. You picked the workspace's default
profile during first-time setup; the switcher applies to the current document
and is remembered on that file, while new files use the workspace default.

## Adding a profile or changing an existing one

The bundled profiles are plain text files (in YAML, a simple
human-readable format) that live alongside the app. You can copy one and tweak
its action prompts to suit your work — for example, give the **Polish** action a
more old-fashioned brief, or add an action that always converts British
spellings to American. The settings tab's **Modes & actions** section points you
at the folder; restart Canv after editing for the changes to load. The repo
README describes the file shape.

## What the AI is allowed to do during one of these actions

Selection and document actions only read the text you sent them. They write
nothing to disk on their own — the AI's reply lives entirely in the result panel
until you click **Apply** (see
[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md)). If
you want the AI to create files, edit other files, or carry out a multi-step
task, that is the chat assistant's job; see
[Working with an AI assistant](working-with-an-ai-assistant.md).

## Up next

[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md)
covers what you do with the output the AI just produced.
