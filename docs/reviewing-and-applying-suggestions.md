# Reviewing and applying AI suggestions

Every action you trigger from the floating toolbar or the run-on-document
menu produces a **run** — a record of what you asked, what the AI said,
and the rewrite (if any) it produced. Runs live in the bottom panel and
stick around until you close them, so you can compare different
attempts side-by-side, come back to an old one tomorrow, or refine a
result with a follow-up. This page covers reading a result, applying
it, and managing the history of runs in a session.

## What a run looks like

A new run opens in the **Runs** tab at the bottom of the window. The
top of the run shows what action was used (for example, "Polish") and
the model the AI used. Beneath that the response is split into two
sections, depending on the action's output style:

- **Notes** — what the AI noticed, suggestions, things to consider.
  Some actions, like Story Reviewer, are pure notes — there is no
  rewrite, only feedback.
- **Suggested rewrite** — the rewritten text. Where there is both
  notes and a rewrite, the rewrite is shown alongside an inline diff
  against the text you originally selected. The diff highlights
  additions and removals so you can see at a glance how heavy-handed
  the rewrite has been.

The response streams in live as the AI types it. You can start reading
before it has finished.

## Applying a rewrite

The run header has an **Apply** button. Clicking it replaces the
original selection in the editor with the AI's rewrite. If the run
came from a document action rather than a selection action, **Apply**
replaces the whole document.

Apply is a one-click action — it doesn't ask you to confirm. The
previous text is recoverable from Canv's revision history if it is
turned on; see
[Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).

Each run can only be applied once. Once you've applied a rewrite,
**Apply** is disabled for that run so a second click can't prepend
another copy.

## Asking for another go

If the rewrite isn't quite right, the run has two ways to ask again
without losing what you already have:

- **Rerun** sends the same request to the AI again. The new response
  appears as a separate run; the original stays. This is how to get a
  second draft you can compare against the first.
- **Refine** lets you give the AI a short note about what to change
  about the previous result. Type "tighten the dialogue" or "less
  formal" into the refine box and submit; the AI rewrites with your
  note in hand. The refined response also appears as a separate run.

Both of those leave the original result intact, so you can compare
attempts and pick the best one.

## Going back to an older run

The Runs tab keeps every run from your current session. Click an old
run to bring it back into the panel; **Apply**, **Rerun**, and
**Refine** all still work. To remove a run you no longer want, use the
close control on its tab.

## Reading a cleaner copy or inspecting the raw exchange

Next to **Runs** is an **Output** tab that gives you a cleaner reading
view of a run — just the notes and the rewrite, with no controls — and
also lets you inspect the raw exchange behind a chat message. This is
helpful when an answer was confusing and you want to see exactly what
the assistant was sent.

## Watching for problems

The bottom panel also has a **Problems** tab. Canv runs a few automatic
checks across your workspace — broken links to files that don't exist,
references to headings that aren't there, that kind of thing. Each
issue links to the line it found, so clicking jumps you to the right
place to fix it. You can rescan from the tab when you've moved files
around.

## Up next

Once you have a result and you've applied it, the obvious next concern
is "can I get the old version back?" — see
[Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).
