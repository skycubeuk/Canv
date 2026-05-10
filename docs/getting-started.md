# Getting started

This page walks you from a fresh install to writing a paragraph and asking
the AI to rewrite it. Five minutes, end to end.

## Installing Canv

Download the build for your operating system from the project's releases
page:

- macOS: a `.dmg`. The build is unsigned, so on first launch right-click
  the app and choose **Open** to bypass Gatekeeper. After that it opens
  normally.
- Windows: an installer or a portable executable. SmartScreen may warn
  "publisher unknown". Click **More info → Run anyway**.
- Linux: an `AppImage`, `.deb`, or `.rpm`. Make the AppImage executable
  (`chmod +x`) before double-clicking it; install the `.deb` or `.rpm`
  through your usual package tool.

Canv does not phone home. Your writing stays on your computer. When you
ask an AI for help, the request goes from your machine straight to the
provider you chose.

## Choosing the kind of writing this is

The first time you launch Canv, it asks what kind of writing this is.
There are three built-in profiles:

- **Fiction** — stories, novels, short fiction. Voice and craft matter.
- **Technical** — software docs, API guides, how-tos.
- **Factual** — essays, journalism, reference work.

Pick whichever fits. The AI's tone, the names of the editing actions, and
the system prompts the model receives all change to suit the kind of
writing you're doing. You can switch later — every new document asks
again, and you can change the active profile from the bottom-left of the
window.

The rest of this guide uses the Fiction profile in its examples.

## Pointing Canv at a folder of writing

Canv treats one folder on disk as your workspace. Every file inside it
shows up in the sidebar; new files you create land in that folder.

After you pick a profile, choose a workspace folder. An empty folder is
fine — Canv will drop a short `Welcome.md` into it. If you already have a
folder of markdown files, point Canv at it and your existing files appear
straight away.

To switch to a different folder later, click the workspace name in the
top bar.

## Adding an API key

To get help from the AI, Canv needs an API key from a provider. Two
providers are supported out of the box: Anthropic and OpenAI. You only
need a key for the one you actually want to use.

1. Open the settings tab (the cog at the bottom-right of the status bar).
2. Pick your provider in the **Default provider** dropdown.
3. Paste your key into the field below. Follow the provider's
   instructions if you don't have one yet.

The key is stored on your computer. Canv calls the provider directly from
your machine — there's no Canv server in between.

## Writing your first paragraph

Click any markdown file in the sidebar to open it, or right-click in the
file tree and create a new one. The middle of the window is where you
write.

Type as you would in any text editor. Canv saves automatically as you
write — the indicator on the left of the bottom status bar flips between
**Saving…** and **Saved**. There's a word count, an estimated reading
time, and your current line and column down there too.

## Asking the AI to do something with what you wrote

Select a paragraph by dragging across it. A small toolbar appears just
above the selection. The buttons on it depend on your profile, but in
Fiction you'll see things like **Polish**, **Make Shorter**, **Make
Longer**, **Refine**, **Brainstorm**, and **Free Edit**. Click one.

For most actions, the AI starts working straight away and you watch its
reply stream in. Some actions ask for a one-line instruction first —
**Refine**, **Free Edit**, and **Brainstorm** all want to know what you'd
like done. Type the note and press Enter.

When the response is ready, you can paste the rewrite back into the page
with the **Apply** button, or keep both versions side by side and decide
later. Reviewing past results is covered on
[its own page](reviewing-and-applying-suggestions.md).

That's the loop: write, select, ask, apply.

Next: [Writing and editing text](writing-and-editing-text.md).
