[< Docs](README.md)

# Getting Started

> **Status:** nothing to install yet. The extension is scaffolding. This page describes the intended experience once [CV0.E1.S1](project/roadmap/cv0-it-works/cv0-e1-kroki-through-the-wire/cv0-e1-s1-mermaid-via-kroki/README.md) ships.

## Intended install (not yet functional)

```bash
pi install npm:pi-fence
```

Then `/reload` inside pi, or restart.

## Intended first test (not yet functional)

Ask the assistant for a diagram:

> Draw me a mermaid diagram of an OAuth 2.0 authorization code flow.

The assistant will answer with a fenced mermaid block. pi-fence should intercept it and render a PNG inline, below the assistant's text, in any terminal that supports inline images (Ghostty, Kitty, iTerm2, WezTerm).

If you don't see an image, check:

- Your terminal supports inline images.
- You have network access (the default processor uses [kroki.io](https://kroki.io)).

## Next

Once S1 ships this page expands with:

- Configuration examples (`pi-fence` block in `settings.json`)
- Offline setup via Docker Kroki
- Adding/removing processors
- Writing your own processor

Track progress in the [worklog](process/worklog.md).
