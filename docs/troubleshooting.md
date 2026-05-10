# Troubleshooting

Most things in Canv just work. The few that catch people out are
listed here, with what to do about them.

## "App can't be opened" or "publisher unknown" on first launch

Canv builds aren't signed by Apple or Microsoft, so the operating
system warns you the first time you open the app.

- **macOS**: right-click the app in Applications and choose **Open**.
  Confirm in the dialog. After this once, double-click works for
  every future launch.
- **Windows**: SmartScreen shows a blue panel saying the publisher
  is unknown. Click **More info** and then **Run anyway**.
- **Linux**: with the AppImage, run `chmod +x canv-*.AppImage` once
  before double-clicking it. With the `.deb` or `.rpm`, install
  through your usual package tool.

These are first-launch warnings, not errors. The app itself is the
same as the project's published release.

## "No API key" warning in the status bar

If the status bar shows an amber warning at the bottom of the screen,
Canv hasn't been given an API key for the active provider. Click
the warning to jump straight to the settings tab, or open settings
yourself from the cog at the bottom-right of the status bar.

- Pick the provider you want to use in the **Default provider**
  dropdown.
- Paste your key into the field below it. Follow the provider's
  instructions to create one if you don't have it yet.

Without a key, AI actions and the conversation will fail. Everything
else (writing, file management, search, Git) keeps working.

## A run errored, was rate-limited, or got cut off

The conversation panel and the runs list both show what happened,
including the message the provider returned. The most common causes:

- **Rate-limited** — you've made too many requests too quickly. The
  retry button shows a countdown to when it's safe to try again.
- **Network error** — your connection dropped or the provider is
  unreachable. Wait a moment and retry.
- **Max tokens** — the response got cut off before the model
  finished. Open settings, raise the **Max output tokens** slider,
  and re-run.

If the same call keeps failing the same way, switch the conversation
to a different model and try once. That's usually enough to tell
whether the problem is your network, the provider, or the request.

## Conflict — the file changed on disk while you were editing

If something else writes to the same file (an editor, a sync tool,
a colleague over a shared folder), Canv shows **Conflict** in the
status bar and stops auto-saving so it doesn't trample the other
change. To resolve it, close and re-open the file. Canv shows you
the current contents on disk; you can paste your unsaved edits back
in if you want them.

## A view didn't update after I changed the source files

Generated views don't track file changes automatically. The sidebar
will show a "stale" badge on the view, but the view itself won't
update until you ask the AI to regenerate it. Use the regenerate
icon on the view's row, or describe the changes you'd like in the
conversation.

## I want to start over without losing anything

Export a backup first. Settings tab → **Export backup** writes
everything to a JSON file. Once you have that, you can:

- Switch workspace folders to a fresh one — your old folder is
  untouched and Canv's data goes with the new workspace.
- Or import the backup back later if you change your mind.

## Where the logs are

If you need to file a bug, the developers will probably ask for
logs. Logs live alongside Canv's other application data:

- macOS: `~/Library/Application Support/Canv/`
- Linux: `~/.config/Canv/` (or `$XDG_CONFIG_HOME/Canv/`)
- Windows: `%APPDATA%\Canv\`

Inside that folder you'll find a `logs/` subfolder.

## Profile changes I made aren't showing up

Profiles are read from a YAML file at startup. If you (or a
developer) edited a profile file and your changes aren't visible,
restart Canv. The settings tab has an **Open config folder** button
to take you straight to the file.
