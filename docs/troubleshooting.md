# Troubleshooting

This page covers the bumps you might hit on first launch and what to do
when something goes wrong.

---

## First launch

### macOS — "Canv can't be opened because Apple cannot check it for malicious software"

Canv builds are currently unsigned. To open the app the first time:

1. Right-click (or Control-click) **Canv.app**.
2. Choose **Open**.
3. In the warning dialog, click **Open** again.

You only need to do this once. After that, Canv opens normally.

> _Screenshot pending — see [MANUAL.md](screenshots/MANUAL.md)._

### Windows — "Windows protected your PC"

The installer is unsigned, so SmartScreen warns you. To proceed:

1. Click **More info** in the warning.
2. Click **Run anyway**.

> _Screenshot pending — see [MANUAL.md](screenshots/MANUAL.md)._

### Linux

`.AppImage`: make it executable, then run:

```bash
chmod +x canv-*.AppImage
./canv-*.AppImage
```

`.deb` (Debian, Ubuntu, and derivatives):

```bash
sudo dpkg -i canv_*.deb
```

`.rpm` (Fedora, RHEL):

```bash
sudo rpm -i canv-*.rpm
```

---

## Common errors

### "API key invalid" / 401 from the provider

When an agent run fails because the API rejected your key, a red error box
appears inside the results panel with the provider's error message — for
example:

> `Anthropic 401: {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}`

> _Screenshot pending — see [MANUAL.md](screenshots/MANUAL.md)._

Check, in order:

1. **The right key for the right provider.** Anthropic keys begin with
   `sk-ant-`; OpenAI keys begin with `sk-`. Make sure the provider selected
   in Settings matches the key you pasted.
2. **Spaces or quotes pasted in.** Open the Settings tab, clear the API key
   field, paste again, and save.
3. **Key scope.** Some keys are restricted to specific models or
   organisations. Confirm your key has access to the model selected in
   Settings.
4. **Networking.** Canv talks directly from your machine to
   `api.anthropic.com` or `api.openai.com`. A corporate proxy, firewall, or
   VPN can block these endpoints.

### "Workspace looks empty"

If the file tree shows no files after opening a folder:

1. Confirm the folder actually contains `.md` or `.markdown` files. Canv
   shows only markdown files in the file tree (binary files, images, and
   other formats are hidden).
2. Check that the folder is readable by your user account. Canv uses your
   OS account's file permissions; a folder you don't own (for example a
   system folder) may not list its contents.

### Chat stops calling tools mid-task

Chat stops using tools after it reaches the **Chat tool budget per message**
limit (default: 10 rounds). When the budget is reached, the model is asked
to write a final answer without further tool calls rather than stopping
abruptly — so the reply may appear shorter or less complete than expected.

To change the limit: open the **Settings** tab, find **Chat tool budget per
message**, and increase the value. See [Settings and data](settings-and-data.md)
for details.

---

## Where to find diagnostic information

Canv does not write a log file. The main diagnostic surface is the browser
developer tools console inside the app:

**View → Toggle Developer Tools** (or press `F12` / `Cmd+Option+I` on
macOS)

The **Console** tab shows renderer-process messages. The **Network** tab
shows API requests and their responses, which is the fastest way to confirm
what error code the provider is returning.

> Note: **View** menu items may not appear if Canv has removed the menu bar
> on your platform. In that case, right-click anywhere in the app window and
> choose **Inspect Element** to open the DevTools panel.

---

## Filing a bug

Open an issue at <https://github.com/skycubeuk/Canv/issues> and include:

- What you were doing (one or two sentences).
- Your OS and Canv version (check `package.json` `version` field if you
  built from source, or look in the window title bar).
- The error message verbatim, if any.
- Relevant output from the DevTools Console or Network tab.
