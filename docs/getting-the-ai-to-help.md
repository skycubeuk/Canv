# Getting the AI to help with a passage

Canv's editing actions are short, focused asks: rewrite this paragraph,
shorten it, polish it, brainstorm ten alternatives. They're meant for
the kind of quick pass you'd otherwise do by hand. This page covers how
to trigger them, what each kind of action expects, and how to run a
pass over an entire document.

## Picking a passage and asking for help

Drag across the text you want to work on. A small toolbar floats just
above the selection. The buttons on it depend on the active profile;
in the Fiction profile they include things like **Grammar & Spelling**,
**Story Reviewer**, **Polish**, **Make Shorter**, and **Brainstorm**.

Click an action. Canv sends your selection (plus any pinned context
files) to the AI, opens the results panel below the writing area, and
streams the response in as the model produces it. You can keep writing
while it streams — the run keeps going in the background.

When the response is finished, you can paste the rewrite back into the
page or set it aside and try a different action. See
[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md)
for the full apply-and-refine flow.

## The kinds of action

Profiles bundle several different *kinds* of action. They behave
slightly differently, and it helps to know which is which.

- **Direct rewrites** replace your selection with a new version. Polish,
  Make Shorter, Make Longer, Simplify, More Sophisticated all work this
  way: the AI's reply is the rewrite, no commentary.
- **Feedback only** — the AI reads your selection and replies with
  notes, not a rewrite. Story Reviewer, Logic Checker, and Test Reader
  in the Fiction profile work this way. Use these when you want a
  reaction, not a substitute paragraph.
- **Feedback plus a rewrite** — you get both: bullet-point notes
  explaining what was changed, plus the changed text. Grammar & Spelling
  and Free Edit work this way. Useful when you'd like to know *why*
  something was changed.
- **Brainstorm** — generates a numbered list of ideas. Always asks you
  for an instruction first ("ten alternative chapter titles", "five
  ways the scene could end").

A small icon next to each action's name hints at its kind, but the
fastest way to learn the difference is to try a couple on the same
paragraph and compare.

## Actions that ask for a one-line note

Some actions need direction from you — they don't have a fixed job.
**Refine**, **Free Edit**, and **Brainstorm** all open a small input
field when you click them. Type a short instruction and press Enter:

- *Refine*: "make this more present-tense" or "tighten the dialogue".
- *Free Edit*: "remove the phrase 'just' wherever it appears" or "use
  British spelling".
- *Brainstorm*: "ten alternative names for the inn" or "five reasons
  the door is locked".

Keep the instruction short. The AI already has the passage; you don't
need to repeat what's in it.

## Running a pass over a whole document

Some actions are designed to read an entire document, not a paragraph
— a story review, a logic check, an end-to-end grammar pass. To trigger
those without selecting any text, look at the top-right of the writing
area: there's a **Run** button with a small chevron next to it. Click
the chevron to see every document-level action your profile offers,
then pick one.

Canv shows the active filename in the menu so you know what the run is
about to read.

## Stopping a run that's gone on too long

The bottom panel shows the run as it streams. If the AI is taking too
long or going off track, click **Stop** in the run's row. The partial
response is preserved and the run is marked aborted. You can re-run, or
edit your selection and try again.

The status bar shows a live token count and dollar cost while the run
is in flight, so you can see the bill before it lands.

## Choosing which model handles which action

By default, every action uses your default model (set in the settings
tab). If you'd rather have, say, a stronger model for full-document
reviews and a faster, cheaper one for one-line edits, you can override
the model per action. In the settings tab, untick **Use default model
for all actions** and pick a provider/model for each action you want to
treat differently. Actions you don't override fall back to the default.

Useful patterns:

- A faster model on **Polish** so quick rewrites feel snappy.
- A stronger model on **Story Reviewer** so full-document reads are
  worth the wait.

Each action remembers its model between sessions.

Next: [Working with an AI assistant alongside your draft](working-with-an-ai-assistant.md).
