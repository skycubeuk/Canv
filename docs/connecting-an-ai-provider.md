# Connecting an AI

Canv doesn't come with an AI account of its own — you decide which AI does the
work and connect it. You have two kinds of choice: a cloud service that runs the
AI on its own servers (Anthropic or OpenAI), or a model running locally on your
own machine (Ollama). This page covers connecting each, where your keys are
kept, choosing which model runs, and keeping an eye on the cost.

## Cloud or local

- **Cloud (Anthropic, OpenAI).** You sign up with the provider, create a key,
  and paste it into Canv. The provider runs the model and charges you for what
  you use. This is the simplest route and gives you the strongest models.
- **Local (Ollama).** You run a model on your own computer with Ollama. Nothing
  leaves your machine and there's nothing to pay per use, but the models are
  smaller and you need a capable computer. Good when privacy matters most or you
  want to work offline.

You can set up more than one and choose between them as you work.

## Adding a key

Open the settings tab. For a cloud provider, paste your key into the field for
Anthropic or OpenAI — follow the provider's own instructions to create a key
first. For Ollama, point Canv at the address Ollama is serving on (the default
local address is filled in for you) and refresh the list so Canv can see which
models you've pulled.

Your keys are stored on your own machine. Canv talks to the provider directly
from the app; your key isn't sent anywhere else.

## Choosing which model runs

Once a provider is connected, you pick which of its models to use. In the chat,
the provider and model are chosen at the top of a new conversation and stay
fixed for that conversation once it's under way, so a long exchange stays
consistent. Different conversations can use different models. The passage actions
use the model you've set up as well.

If a provider or one of its models isn't configured yet, it won't clutter the
picker — only what you can actually use is shown.

## Keeping an eye on the cost

Cloud models charge by how much text goes back and forth. As you chat, Canv shows
the tokens used and an estimated cost for the exchange, so a long session doesn't
surprise you. If your pricing differs from Canv's built-in figures — a negotiated
rate, say — you can override the per-model prices in settings so the estimate
matches your bill. Local models through Ollama cost nothing per use, so there's
nothing to track there.

## Connecting extra tools

Beyond the providers, Canv can connect to **MCP servers** — small services that
give the assistant extra abilities, like reaching a database or an external API.
You add and configure these in settings; once connected, their tools become
available to the assistant, and any action that changes something still asks for
your approval the same way file changes do (see
[Working with an AI assistant](working-with-an-ai-assistant.md)).

## Up next

With an AI connected, put it to work on a passage in
[Getting the AI to help](getting-the-ai-to-help.md).
