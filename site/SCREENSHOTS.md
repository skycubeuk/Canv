# Site screenshots

These images are referenced by the landing page in `site/src/pages/index.astro`.
Replace each placeholder PNG with a real screenshot before launch.

## Required shots

| File | Used by | What to capture |
|------|---------|-----------------|
| `hero.png` | Hero section | The Canv editor with an inline AI diff visible on a paragraph. Dark theme, Fiction profile. ~1600×1000. |
| `capability-selection.png` | "Run an agent over a selection" card | A paragraph selected in the editor with the action menu open showing the available agents. |
| `capability-diff.png` | "Inline diff and one-click apply" card | A side-by-side diff inside the editor with both Apply and Reject buttons visible. |
| `capability-history.png` | "Revision archaeology" card | The History sidebar tab with a list of workspace snapshots. |
| `capability-chat.png` | "Talk to an AI alongside your draft" card | The chat panel beside the editor mid-conversation, ideally with a tool-call chip visible. |
| `capability-readaloud.png` | "Listen to your writing" card | The Recordings panel with a couple of readings, one playing — footer transport (scrubber, speed) and the now-playing strip in the status bar visible, alongside the editor. |

## Conventions

- Dark theme.
- Fiction profile.
- Crop tight; no surrounding desktop chrome.
- 16:10 aspect ratio for the hero, free aspect ratio for the capability shots.
- PNG, optimised with `pngcrush` or `oxipng` before committing.
