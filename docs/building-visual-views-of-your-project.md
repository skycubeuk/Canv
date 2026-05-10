# Building visual views of your project

Sometimes a paragraph isn't the right shape for what you want to see.
You might want a timeline of every scene, a chart of point-of-view
across chapters, a map of the cast and how they relate, or a board of
TODOs. Canv can build small interactive views like this from your
files, and keep them around to come back to.

This page is the writer-facing tour. The actual building is done by
the AI assistant in the conversation panel.

## What a "view" is here

A view is a small self-contained web page that Canv generates,
stores inside your workspace, and serves back to you on demand. It
runs in your browser. It's nothing more than HTML, CSS, and a sprinkle
of JavaScript, possibly with a charting library — there's no server,
no signup, no cloud. The files for the view live in a hidden folder
inside your workspace, so they travel with the project.

Some views the AI is likely to suggest:

- A vertical timeline of every scene, with chapter, point of view,
  and one-line summary.
- A bar or pie chart of word count per chapter, or speaking lines per
  character.
- A small kanban-style board of plot threads (open / in progress /
  resolved).
- A relationship graph between characters or concepts.
- A heatmap of which chapters mention which characters.

Anything you can describe in writing, the AI can probably build a
view of — within reason. Views are best for things you'd otherwise
have to count, sort, or arrange by hand.

## Asking the AI to build one

Open the conversation panel. Describe the view you want, in plain
language. For example:

> Show me a timeline of every scene, with the chapter number, the
> point-of-view character, and a one-line summary. Sorted in story
> order.

The AI reads the relevant files, generates the page, and registers it
with the workspace. When it's done, the view opens in your default
browser at a local address. You can keep the browser tab open while
you write — the view doesn't change until you ask for it to.

Files written inside a view's own folder don't trigger the per-file
approval prompts you'd normally see when the AI edits your draft. Canv
treats the view's folder as the AI's workspace for this job, so it can
build or rebuild the whole thing — usually a handful of files — in one
pass without interrupting you. Anything written outside that folder
still needs your approval as usual.

## Coming back to a view later

The sidebar has a section listing every view you've built. Each shows
its name, when it was last built, and a small badge if any of the
source files have changed since (so you know it might be out of
date).

Click a view to open it again in your browser. You can pin views to
keep them at the top of the list, and unpin them again when they're
not relevant anymore. Use the small icons next to the name to delete
or regenerate.

## Keeping a view in sync

When you change the underlying files — rewrite a scene, add a new
chapter, rename a character — the view itself doesn't update. Canv
notices the source files changed and marks the view stale.

To bring it up to date, ask the AI to regenerate it. The fastest way
is to use the regenerate icon on the view's row in the sidebar; that
sends the original prompt back to the AI as a starting point. You can
also describe the changes you want first and ask the AI to update the
view to match.

The AI knows the difference between *building a new view* and
*updating an existing one* — it'll edit the existing files rather
than starting fresh, so your tweaks (a custom colour, a re-arranged
layout) survive an update.

## What this is not

This isn't a publishing tool. The views live on your computer and
are served only to your computer — sharing one means sharing a
screenshot or the underlying files, not a public link.

If a view starts to feel essential, treat it like any other file in
your project: it lives in the workspace folder, it's checked in if
you're using Git, and you can hand it off with the rest.

Next: [Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).
