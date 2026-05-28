# Getting the AI to help with a passage

Canv's editing actions are short, focused requests — rewrite this paragraph,
tell me what's wrong with this scene, make this section shorter without losing
the voice. You pick the text, click an action, and the result comes back in the
document for you to keep or discard. This page covers running those actions on a
selection or a whole document, and switching profiles to change what the AI is
tuned for.

## Running an action on a selection

Select a run of text and the toolbar beside it carries your profile's AI actions
alongside the formatting buttons. Click one and the AI works on just that
passage. In the Fiction profile you'll see actions like:

- **Polish** — tighten and improve the passage while keeping your voice.
- **Make Shorter** / **Make Longer** — change the length without losing the
  sense.
- **Story Reviewer** — read the passage and tell you what's working and what
  isn't, without rewriting it.
- **Brainstorm** — suggest directions rather than change the text.

Some actions need a word from you first — **Free Edit** and **Refine** ask for a
short instruction ("make the dialogue snappier") before they run. The rest go
straight to work.

## Running an action on a whole document

Some actions are meant for a whole file rather than a fragment — a review of an
entire chapter, say. Those run from the document-action menu above the editor,
which works on the open file without you selecting anything. A document action
reads the whole file, so it takes a little longer than a single paragraph.

## Where the result goes

What you get back depends on the action:

- **A rewrite of a selection** appears in the document itself as an inline
  diff — the proposed wording shown in place against your original — which you
  accept or reject change by change.
- **Review and feedback** comes back as notes pinned to the spans they're about,
  in the margin of your document.
- **A rewrite of a whole document** is offered in a panel with an **Apply**
  button, since there's no single selection to show it against in place.

Reading these results, accepting or rejecting them, and refining a result you're
not happy with are all covered in
[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md).

## Switching profiles

The set of actions you see, and the way the assistant talks, both come from your
**profile**. Fiction, Factual, and Technical ship with Canv, each tuned for a
different kind of writing — Fiction leans into voice and craft, Technical into
precision and consistency. Switch profiles whenever the work changes; the action
buttons and the assistant's manner change with it.

## Writing your own profile

A profile is a file that lists its actions and the instructions behind them. You
can copy a built-in one and adjust it — change the wording an action sends to the
AI, add an action of your own, or drop ones you don't use. Each action says what
text it works on (a selection, a whole document, or either), and whether it
rewrites the text, just leaves notes, or does both. This is the way to make the
AI's help fit how you actually write.

## Up next

See what comes back and decide what to keep in
[Reviewing and applying suggestions](reviewing-and-applying-suggestions.md).
