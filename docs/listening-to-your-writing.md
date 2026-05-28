# Listening to your writing

This page covers having your writing read back to you. Canv can read a passage
you've selected, or a whole document, in a natural voice, and it keeps every
reading so you can play it again. Hearing your prose out loud is a good way to
catch awkward phrasing and run-on sentences that the eye slides over.

Reading aloud uses ElevenLabs, an online voice service. Like the AI that helps
with your text, it runs in the cloud: the words you ask Canv to read are sent to
ElevenLabs, which sends back the audio. You give Canv a key for the service
before any of this works.

## Setting up a voice

Open the settings tab and find the **Read aloud (ElevenLabs)** section. Paste in
your ElevenLabs key — follow the provider's instructions to create one. Your key
is stored on your own machine, the same way your other provider keys are; see
[Connecting an AI](connecting-an-ai-provider.md) for more on where keys live.

With the key in, Canv loads the voices on your account and lets you pick a
**default voice** and a **voice model**. The voice is who you hear; the model is
the engine behind it, trading off quality, speed, and which languages are
supported. If you're not sure, the suggested model is a fine place to start. You
can change either at any time.

## Reading a passage aloud

Select a run of text and the toolbar that appears beside it has a **speaker**
control alongside the formatting and AI buttons. Click it and Canv reads the
selected text in your default voice, starting to play as soon as the audio is
ready.

Next to the speaker is a small control for picking a different voice for this one
reading, without changing your default — useful when you want to hear a
particular passage in another voice.

## Reading a whole document

To hear a whole file, you have three ways in:

- The quick-find that pops up over the editor has a **Read aloud: document**
  entry.
- The **Recordings** panel (below) has a **Read this document** button in its
  header.
- Right-clicking in the editor offers **Read aloud**, which reads your selection
  if you have one and the whole document if you don't.

Because a whole document can be long, and the text is sent to the voice service,
Canv asks you to confirm before reading anything very large.

Canv reads the words, not the markup. Headings and links are read as ordinary
prose, and code blocks are left out, so you hear your writing rather than a
recitation of asterisks and backticks.

## Playing back and tidying up recordings

Every reading is saved, and they collect in the **Recordings** panel on the
left, newest at the top. Each entry shows a short label (the document name, or
the start of the selected text), the voice that read it, whether it was a
selection or a whole document, how long ago it was made, and its length.

Click a recording to play it. While something plays you get play and pause
controls, a bar you can drag to move through the audio, the elapsed and total
time, and a speed control for hearing it faster or slower. A small now-playing
strip sits in the status bar at the bottom of the window, so you can pause from
anywhere and the audio keeps going if you switch the left panel to your files or
elsewhere.

To remove a reading you no longer want, delete it from its row. Recordings are
kept privately inside your workspace and don't show up in your file tree, so they
stay out of the way of your actual writing.

## Up next

To run a one-off rewrite or review on the passage you just listened to, see
[Getting the AI to help with a passage](getting-the-ai-to-help.md).
