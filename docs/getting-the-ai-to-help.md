# Getting the AI to help with a passage

Canv's editing actions are short, focused requests — "rewrite this
paragraph", "tell me what's wrong with this scene", "make this section
shorter without losing the voice". You pick the text, click an action,
and the answer arrives in a panel below the editor for you to look at
before deciding what to keep. This page is about running those actions,
the difference between running on a selection and on a whole document,
and how the profile you've chosen changes what's on offer.

## Running an action on a selection

Select any run of text in the editor. A floating toolbar appears next to
your selection with the profile's selection actions — Grammar &
Spelling, Polish, Make Shorter, Make Longer, Simplify, More
Sophisticated, Brainstorm, Translate, and so on. Click one. Canv sends
just the selected text (plus a few short lines of surrounding context)
to the AI and streams the reply into a runs panel at the bottom of the
window.

Two of the selection actions need a short instruction from you before
they run — **Free Edit** (which takes whatever you ask of it) and
**Refine** (a follow-up against a previous result). When you click one,
the toolbar opens a small text box; type your instruction and submit.

The action panel that opens beneath the editor shows two halves: the
AI's notes about what it found, and the rewrite itself with an inline
diff against your original text. The next page,
[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md),
covers what to do with that result.

## Running an action on the whole document

Some actions are about the document as a whole — Logic Checker, Story
Reviewer, Test Reader, Summarise. These appear in the **Run on
document** menu at the right end of the floating toolbar. With nothing
selected (or with everything selected), pick an action from that menu
and the AI receives the full document instead of a fragment.

Document actions stream into the same runs panel as selection actions.
Because they read the whole file, they take longer than a paragraph
rewrite — the panel shows the response forming live so you can start
reading before it finishes.

You can also reach every document action from the command palette by
name — see
[Finding and organising your work](finding-and-organising-your-work.md)
for the palette.

## Switching profile

The set of actions on the toolbar comes from the **profile** you've
picked. Canv ships with three:

- **Fiction** — stories, novels, short pieces, scene work. Actions are
  tuned to preserve voice, character, and pacing.
- **Factual** — essays, articles, reports, blog posts. Actions are
  tuned for general non-fiction prose.
- **Technical** — documentation, specs, how-tos, references. Actions
  are tuned for precision and consistency.

The current profile is named in the bottom status bar. Click it to
switch. Switching the profile changes the toolbar's action set, the
chat assistant's tone, and the system instructions that go with every
AI request.

You picked the workspace's default profile during first-time setup; the
switcher applies to the current document and remembers your choice on
that file. New files use the workspace default.

## Adding a new profile or changing an existing one

The bundled profiles are YAML files that live alongside the app. You
can copy one to your own machine and tweak the action prompts to suit
your work — for example, give the **Polish** action a more
old-fashioned brief, or add a new action that always converts British
spellings to American. The repo README has instructions for the YAML
shape; restart Canv after editing for the changes to load.

## What the AI is allowed to do during a selection or document action

Selection and document actions only read the text you sent them and
write nothing to disk on their own. The AI's reply lives entirely in
the runs panel until you click **Apply** — see
[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md).
If you want the AI to create files, edit other files, or run a
multi-step task, that is the chat assistant's job; see
[Working with an AI assistant](working-with-an-ai-assistant.md).

## Up next

[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md)
covers what you do with the output the AI just produced.
