# Working with an AI assistant alongside your draft

The selection actions covered on the previous page are short, one-shot
asks. The conversation panel is for the longer, looser kind of help —
asking the AI to read your draft and discuss it, ask you questions,
search across files for you, or carry out a small file change. This
page covers how to use it well.

## Opening the conversation alongside your draft

Click the speech-bubble icon at the bottom-right of the status bar to
open the conversation panel. By default it docks at the bottom of the
window. You can dock it to the right instead, or pop it out into a
separate window — useful on a second monitor. The dock controls live in
the top bar of the panel.

When the panel is open, the file you're currently editing is shown as
context above the input. The AI knows that file is what you're working
on.

## Asking for help

Type into the input area and press Enter. The AI replies inline. You
can ask in plain language — there's no syntax to learn:

- "Read the chapter and tell me where the pacing slows."
- "Search the workspace for any mention of the locket."
- "List every chapter that takes place at sea."
- "Add a new file `notes/setting-rules.md` with three rules for how
  magic works."

Shift-Enter adds a new line without sending. The input grows to fit
what you've typed.

## What the assistant can do for itself

Unlike the selection actions, the conversation can take steps in your
workspace on your behalf. It can:

- **Read** any file in the workspace, list folders, and search across
  files.
- **Create**, **edit**, **delete**, or **rename** a file or folder.
- Maintain a small to-do list of things it's working through, which
  shows up in the conversation as a checklist so you can see what's
  left.

It can do this autonomously up to a small budget per message (ten
rounds of action by default; tunable in settings under "Chat tool
budget per message").

## Approving file changes

You're in charge of changes to your files. Whenever the assistant
wants to write, edit, delete, or rename anything, the conversation
shows a card describing the change with three buttons:

- **Approve** lets that one change through.
- **Deny** rejects that one change. The assistant carries on without
  it.
- **Approve rest of turn** lets every remaining change in this round
  through without prompting again. Useful when the AI is making a
  series of small mechanical edits and you've seen enough.

Reads, listings, and searches don't require approval — they don't
change anything.

## Keeping more than one conversation going

The assistant supports several conversations at once. Down the side of
the panel is a list of every conversation; click one to switch to it,
or hit the **+** to start a new one. Closing a conversation doesn't
delete it from your history.

Each conversation is locked to whichever provider and model you used
for its first message. If you want a different model, start a new
conversation — that way an in-progress thread doesn't switch model
mid-way and lose its sense of what's been said.

Above the input area you can see (and change) the model for the
*current* conversation only when no messages have been sent yet.

## Watching what it costs

Below each assistant message Canv shows the tokens used and the dollar
cost of that turn — based on the pricing for the chosen model.
Conversation costs are per-message; Canv doesn't track a running total
for you.

If the model is one Canv doesn't have built-in pricing for, you can
override the per-1M-tokens rate in settings under **Model pricing**.

## When something goes wrong

Sometimes a turn fails — the network blips, the model rate-limits you,
the provider is having a bad day. When that happens, the failed
message keeps a small set of retry buttons:

- **Retry** sends the same message again. If the failure was a
  rate-limit, the button shows a countdown until it's safe to try
  again.
- **Edit and retry** lets you change your last message and try
  again.
- **Retry from here** is offered on earlier messages — useful when
  you decide an earlier reply went down the wrong path and you'd
  rather restart from there with the same prompt.

If a turn was cancelled (you pressed **Stop** or hit Escape on a
running response), the conversation shows a "(turn cancelled)" note
so the history stays honest.

## Following the response while it streams

By default the conversation auto-scrolls to keep the latest message
in view. If you'd rather read at your own pace, scroll up — Canv
notices and stops following. The setting can also be flipped manually
in the settings tab under **Auto-scroll chat**.

If the response feels too fast to read in real time, set a **Slow-mode
delay** in settings. Canv inserts a short pause between chunks (50,
100, or 200 ms) so the words arrive at reading pace rather than as a
wall.

Next: [Reviewing and applying AI suggestions](reviewing-and-applying-suggestions.md).
