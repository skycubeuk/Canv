# Building visual views of your project

Sometimes a paragraph isn't the right shape for what you want to see.
A timeline of when scenes happen, a kanban of which characters appear
in which chapters, a chart of word-count growth over time — these are
all easier to read as small interactive views than as prose. Canv can
ask the AI to build one of those views directly inside your workspace,
and keep a list of them so you can come back later. This page covers
both the AI-generated views and the simpler case of serving a folder
of markdown as a small browsable site.

## Asking the AI for a view

In the chat, describe the view you want. Examples that work well:

- "Build me a timeline of when each chapter happens, with the
  character POV in colour."
- "Make a kanban board of every scene in chapters 1–4 grouped by
  status — drafted, revising, done — read from the frontmatter."
- "Chart the word count of each chapter as a bar graph."

The assistant treats this as a request to build a small interactive
website. It reads whichever workspace files it needs (chapters,
character files, the like), writes HTML / CSS / JavaScript into a
folder called `.canv/sites/<some-id>/`, registers the result in your
sites panel, and tells you the URL.

Writes inside `.canv/sites/` are pre-approved, so the AI can build a
site in one pass without making you click Approve for every one of
its ~10–20 files. Anything outside that folder (your actual writing)
still needs your approval before the AI touches it. See
[Working with an AI assistant](working-with-an-ai-assistant.md) for
how approvals work in general.

## Coming back to a view you made earlier

The left sidebar has a **Sites** tab listing every view the AI has
registered. Each entry shows the site's name, the description the AI
gave it, and three actions:

- **Open** loads the site at its local URL in your default browser.
  The URL is served by Canv from your workspace; it doesn't go over
  the internet.
- **Pin** keeps a site at the top of the list. Useful for the one or
  two views you check often.
- **Delete** removes the site from the panel and deletes its files
  from the workspace. There is no undo within the panel; if you have
  history turned on the files are recoverable from a snapshot.

A site can also become **stale** — its source files (the chapters it
read, the frontmatter it parsed) have changed since the AI built it.
Stale sites are flagged in the panel. To regenerate, click the
regenerate control: Canv hands the original request back to the chat
with the same prompt, and the AI rebuilds the site in place. Because
this is a registered site, the AI uses **edit** rather than
**create** for the files, and the registry timestamp updates.

## What the AI can use in a site

The sites runtime makes two JavaScript libraries available at fixed
URLs so the AI can build common charts without fetching anything from
the internet:

- **D3 v7** for custom diagrams, timelines, hierarchies.
- **Chart.js v4** for standard bar / line / pie charts.

For anything else the AI writes plain HTML, CSS and JavaScript. No
external CDN calls.

## Serving a folder of markdown as a website

This is a different thing from an AI-generated site. If you already
have a folder of markdown files — notes, a wiki, a handbook — Canv
can serve it back to you as a tiny static site so you can read it in a
browser, click links between pages, and share it with someone on the
same network.

Right-click a folder in the file tree and choose **Serve as website**.
Canv requires that the folder contains an `index.md` at its top to use
as the landing page. If there is one, the folder is served at a local
URL; if not, Canv tells you to create an `index.md` first.

Only one folder can be served at a time. Right-clicking the served
folder shows **Stop serving** instead. Right-clicking a different
folder while one is being served offers **Serve as website (replaces
current)**.

The served URL is local; like everything else in Canv it doesn't go
over the internet.

## Up next

If a site or a serve isn't doing what you expected, the most common
fixes live in [Troubleshooting](troubleshooting.md).
