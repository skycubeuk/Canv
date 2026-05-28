# Getting started

This page takes you from a fresh install to your first AI-assisted edit:
installing the app, picking a writing profile, opening a folder to write in,
connecting an AI, and the basic rhythm of writing something and then asking the
AI to do something with it.

## Installing Canv

Download the build for your system from the project's releases page and install
it the way you'd install any app. There's a build for macOS (Apple Silicon and
Intel), Windows (an installer and a portable version), and Linux (AppImage,
Debian/Ubuntu, and Fedora/RHEL packages).

On macOS the build is unsigned, so the first time you open it the system may
warn you it can't be checked. Right-click the app and choose **Open** to get
past that once; after that it opens normally. See
[Troubleshooting](troubleshooting.md) if the warning blocks you.

## Choosing a profile

The first time you start Canv, it asks you to pick a **profile**. A profile is a
set of AI behaviours tuned for a kind of writing — the buttons you get for
working on a passage, and the personality of the assistant you chat with, all
change with it. Three come built in:

- **Fiction** — stories, novels, scenes, character work.
- **Factual** — essays, journalism, blog posts, reports.
- **Technical** — documentation, specs, how-tos, references.

Each one shows a short description and a few examples so you can tell them apart.
Pick whichever fits what you're writing; you can switch at any time, and you can
write your own profile later. See [Getting the AI to help](getting-the-ai-to-help.md).

## Opening a folder to work in

Canv works on a **folder** of files on your machine — your workspace. Point it
at an existing folder of writing, or make a new empty one for a fresh project.
Everything you write is saved as plain files inside that folder, so you can back
it up, sync it, or open it in any other editor whenever you like.

The folder's files show in a tree down the left. Click one to open it, or start
a new one from the tree. Working with files is covered in
[Finding and organising your work](finding-and-organising-your-work.md).

## Connecting an AI

You can write in Canv without any AI at all. To turn on the AI help, you give
Canv a key for a provider. Open the settings tab and paste in a key for
Anthropic or OpenAI, or point Canv at a local model running on your own machine
with Ollama. Your key is stored on your machine, and requests go straight from
Canv to the provider.

Which provider, where keys live, how to pick a model, and how to watch the cost
are all in [Connecting an AI](connecting-an-ai-provider.md).

## Writing something, then asking for help

The core loop is short:

1. **Write.** Type into the editor. It's plain markdown — a `#` makes a heading,
   `*` makes a list — but you don't have to remember any of that; selecting text
   gives you formatting buttons, and your work saves itself as you go.
2. **Ask the AI about a passage.** Select a run of text and a small toolbar
   appears beside it. Alongside the formatting buttons it carries your profile's
   AI actions — in Fiction, things like **Polish** or **Story Reviewer**. Click
   one and the AI works on just that passage. What comes back appears right in
   the document for you to accept or reject; see
   [Reviewing and applying suggestions](reviewing-and-applying-suggestions.md).
3. **Or talk it through.** Open the chat to discuss your draft, ask questions, or
   have the assistant make changes across several files. See
   [Working with an AI assistant](working-with-an-ai-assistant.md).

## Up next

Get comfortable in the editor — formatting, preview, and moving around a long
document — in [Writing and editing text](writing-and-editing-text.md).
