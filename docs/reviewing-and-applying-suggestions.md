# Reviewing and applying AI suggestions

Every editing action you trigger from the floating toolbar or from the
**Run on document** menu produces a result. Results don't disappear —
they collect in a panel below the writing area where you can compare
them, refine them, run them again, or paste the new version into your
draft. This page is about that loop.

## Where past results live

The bottom panel has a tab labelled **Runs**. Each run keeps its place
in the list, with the action's icon and name, the time it ran, and a
small dollar amount if a price is known. The list is roughly newest at
the top.

Click any row to bring that run's response back into view on the right.
You can keep ten runs around at once — older ones drop off when you
start a new one — or close a run yourself with the **×** on its row.

Each run remembers:

- Which paragraph it was triggered on.
- The action's instruction, if you provided one.
- The full response the AI gave.
- The model and provider that produced it.
- Token use and cost (when pricing is known).

You can see the source paragraph again by clicking **Show source** at
the top of the run. Useful when you've moved on and forgotten which
paragraph the response was for.

## Pasting the rewrite into your draft

Runs that produced a rewrite (Polish, Make Shorter, Free Edit, and so
on) show an **Apply** button. Click it and Canv replaces the original
selection in your file with the rewritten version. The button greys
out afterwards so you can't accidentally paste the same change in
twice.

If you've kept editing since the run started — added text, deleted
the paragraph, moved things around — Canv may notice the original
range no longer matches and warn you. In that case it's safer to copy
the rewrite manually rather than apply it.

Older runs from earlier versions of Canv may not be applyable; the
button is disabled with an explanation.

## Refining a result without starting over

Sometimes the AI's reply is close but not quite right. Below the
response there's a small input labelled something like "Add a follow-up
note". Type a refinement — "make it past tense" or "use the original
ending" — and submit. The AI replies again, building on its previous
answer rather than starting from scratch. Multiple refinements stack
up, so you can iterate without losing the earlier attempts.

## Running the same action again

If the same action might give a better answer on a second try, click
the **Re-run** circular-arrow button at the top of a run. The same
prompt is sent against the same source. Useful for non-deterministic
actions like Brainstorm, where you might want a second batch of ideas.

Re-running costs another call to the provider; the cost shows up
beside the new run.

## Trying a different action on the same paragraph

The runs panel doesn't tie you to one action. Select the same
paragraph again, click a different action — say try **Make Shorter**
after **Polish** — and both runs sit alongside each other in the
panel. Compare the two and apply whichever you prefer.

## Retrying a failed run

If a run errored or was aborted (you clicked **Stop**), the row in
the panel shows the failure state. Re-running with the circular-arrow
button is the simplest way to try again. If the run errored because
of a rate-limit or network issue, waiting a moment before re-running
usually does it.

Next: [Building visual views of your project](building-visual-views-of-your-project.md).
