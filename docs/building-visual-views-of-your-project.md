# Building visual views of your project

Sometimes a paragraph isn't the right shape for what you want to see. A timeline
of when scenes happen, a board of which characters appear in which chapters, a
chart of word-count growth — these are easier to read as small interactive views
than as prose. You can ask the AI to build one of those directly inside your
workspace and keep a list of them to come back to later. This page covers both
the AI-built views and the simpler case of serving a folder of markdown as a
browsable site.

## Asking the AI for a view

In the chat, describe the view you want. Examples that work well:

- "Build me a timeline of when each chapter happens, with the point-of-view
  character in colour."
- "Make a board of every scene in chapters 1–4 grouped by status — drafted,
  revising, done — read from the front matter."
- "Chart the word count of each chapter as a bar graph."

The assistant treats this as a request to build a small interactive website. It
reads whichever workspace files it needs (chapters, character notes, and so on),
writes the page into a folder called `.canv/sites/` inside your workspace,
registers the result so it shows up in your list of views, and tells you the
address to open.

Writes inside `.canv/sites/` are pre-approved, so the AI can build a view in one
pass without making you approve each of its dozen-or-so files. Anything outside
that folder — your actual writing — still needs your approval before the AI
touches it. See
[Working with an AI assistant](working-with-an-ai-assistant.md) for how
approvals work in general.

## Coming back to a view you made earlier

The left sidebar has a **Sites** tab listing every view the AI has built. Each
entry shows its name, the one-line description the AI gave it, and a few actions:

- **Open** loads the view in your browser at a local address. Canv serves it from
  your workspace; it doesn't go over the internet.
- **Pin** keeps a view at the top of the list — handy for the one or two you
  check often.
- **Delete** removes the view from the list and deletes its files. There's no
  undo in the panel; if history is on, the files are recoverable from a snapshot.

A view can also become **stale** — the files it read (the chapters, the front
matter it parsed) have changed since it was built. Stale views are flagged. To
bring one up to date, use the regenerate control: Canv hands the original
request back to the chat, and the AI rebuilds the view in place.

## What the AI can put in a view

Two charting libraries are made available at fixed addresses so the AI can build
common charts without fetching anything from the internet: **D3** for custom
diagrams, timelines, and hierarchies, and **Chart.js** for standard bar, line,
and pie charts. For anything else the AI writes plain web code. Nothing in a view
calls out to the internet.

## Serving a folder of markdown as a website

This is a different thing from an AI-built view. If you already have a folder of
markdown — notes, a wiki, a handbook — Canv can serve it back as a tiny static
site so you can read it in a browser, click links between pages, and share it
with someone on the same network.

Right-click a folder in the file tree and choose **Serve as website**. The folder
must contain an `index.md` at its top to use as the landing page; if it doesn't,
Canv tells you to create one first. Only one folder can be served at a time.
Right-clicking the served folder shows **Stop serving** instead, and
right-clicking a different folder while one is being served offers **Serve as
website (replaces current)**. The address is local, like everything else in Canv
— it doesn't go over the internet.

## Up next

If a view or a serve isn't doing what you expected, the common fixes live in
[Troubleshooting](troubleshooting.md).
