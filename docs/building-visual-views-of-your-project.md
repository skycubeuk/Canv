# Building visual views of your project

Sometimes a paragraph isn't the right shape for what you want to see. A timeline
of when scenes happen, a board of which characters appear in which chapters, a
chart of how your word count has grown — these read better as small interactive
views than as prose. This page covers asking the AI to build one, and serving a
folder of your writing as a browsable website.

## Asking the AI to build a view

Ask the assistant in plain language — "build me a timeline of every scene in
order" or "show which characters appear in which chapters as a board". It reads
the relevant files and builds a small self-contained interactive view from them,
saved inside your workspace and served back to you at a local address you can
open.

Because a view is a handful of related files built in one go, the assistant
doesn't stop to ask permission for each one — that part is pre-approved, so it
builds the whole thing in a single pass. The view is built only from your own
writing; it doesn't reach out to the internet.

## Managing your views

Built views collect in the **Sites** panel. From there you can:

- **Open** a view at its local address.
- **Pin** the ones you come back to so they stay at the top.
- **Regenerate** a view — the assistant rebuilds it from your original request,
  picking up whatever has changed in your writing since.
- **Delete** one you're done with.

When the writing a view was built from has changed since you last generated it,
the panel flags the view as out of date, so you know to regenerate it when you
want it current again.

## Serving a folder as a website

A different kind of view is your writing itself, read as a site rather than
edited. Right-click a folder that has an `index.md` at its root and choose to
serve it as a website; Canv renders the folder's markdown as browsable pages at a
local address. It's a quick way to read a project as a reader would, with the
links between pages live.

## Up next

Add whole new capabilities to Canv with
[extensions](adding-features-to-canv.md).
