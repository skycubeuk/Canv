# Connecting an AI

Canv doesn't come with an AI account of its own. You decide which AI does the
work and connect it once. You have two kinds of choice: a cloud service that
runs the AI on its own servers (Anthropic or OpenAI), or a model running locally
on your own machine (Ollama) that costs nothing and keeps everything on your
computer. This page covers connecting each one, where your keys are kept, how to
choose which model does a given job, and how to keep an eye on the cost.

A few words used below: a **provider** is the service that runs the AI. An
**API key** is a secret string a cloud provider gives you so it knows the
requests are yours — think of it as a password for billing. A **model** is the
specific AI you're using; each provider offers several, trading speed against
capability.

## Where you connect things

Everything to do with connecting an AI lives in the settings tab, under the
**API keys & endpoints** section. Open settings and that's the first place to
look. What you put there is saved on your own machine — Canv has no server that
sees it. When the AI runs, your computer talks straight to the provider you
chose; nothing passes through Canv's makers.

## Using Anthropic or OpenAI (cloud)

These two run in the cloud and need an API key. Create an account with the
provider and follow their instructions to make a key — see
[Anthropic](https://www.anthropic.com) or
[OpenAI](https://openai.com). Copy the key, paste it into the matching field in
**API keys & endpoints**, and it saves as soon as you click away. The "key
missing" warning on the AI features clears within a moment.

You only need a key for the providers you actually want to use. If you have keys
for both, you can mix them — one chat conversation can use a Claude model while
another uses a GPT model, and Canv works out which key each one needs.

## Running a model locally with Ollama

Ollama is a free tool you install separately that runs AI models directly on
your own machine. Nothing you send to it leaves your computer, and there's no
per-use cost. The trade-off is that local models are generally smaller and
slower than the big cloud ones, and you need a reasonably capable machine.

To use it:

1. Install Ollama from [ollama.com](https://ollama.com) and download at least
   one model with it (its own instructions cover this).
2. Make sure Ollama is running on your machine.
3. In Canv's **API keys & endpoints** section, find the Ollama field. There's no
   key to enter — instead you give Canv the address where Ollama is listening.
   The default, already filled in as a hint, is `http://localhost:11434`, which
   is correct for a normal local install. Leave it unless you've moved Ollama
   elsewhere.
4. Click **Refresh models**. Canv asks your local Ollama which models you've
   downloaded and lists them so you can pick one. If the list comes back empty,
   download a model in Ollama first, then refresh again.

If the refresh fails even though Ollama is running, Ollama may be refusing
requests from Canv. Setting the `OLLAMA_ORIGINS` environment variable to `*`
when you start Ollama allows them; Canv shows this hint next to the field.

## Choosing which model does the work

Once a provider is connected, Canv uses a sensible default model for the
profile's actions. You don't have to change anything to get going.

If you want finer control, the settings tab has more:

- **Per-action model overrides** lets you assign a specific model to individual
  actions — for example, a fast, cheap model for Grammar & Spelling and a more
  capable one for Story Reviewer. There's a single switch to use one default for
  everything, or you can open it up and choose per action.
- In the chat, each conversation has its own model picker above the message box,
  so you can hold one conversation on a fast model and another on a stronger
  one. See [Working with an AI assistant](working-with-an-ai-assistant.md).

## Keeping an eye on the cost

Cloud providers charge per use, so Canv helps you see roughly what you're
spending. A meter near the chat input adds up the tokens (the units providers
bill by) and an approximate dollar figure for the current conversation as it
runs. The figure is worked out on your machine from a price list in settings —
it's a rough gauge, not a billing record. The **Model pricing** section of
settings holds those prices, so you can correct them if a provider changes its
rates. Local Ollama models don't cost anything to run, so the meter is only
meaningful for cloud providers.

## Up next

With an AI connected, the next step is putting it to work on a passage — see
[Getting the AI to help](getting-the-ai-to-help.md) — or holding a longer
conversation in [Working with an AI assistant](working-with-an-ai-assistant.md).
