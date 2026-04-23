# CV1.E2.S1 — Readable errors in place of broken diagrams

**Status:** Done

**Epic:** [CV1.E2 — Error Feedback Loop](cv1-e2--error-feedback-loop.md)
**Date:** 2026-04-22 (spec + retroactive close)

## Summary

When a processor returns an error (Kroki 4xx, parse failure, network error), the user sees a readable error panel in place of the image — "Error rendering <tag> via <processor>" in red, followed by the error text.

## Done criterion

A broken mermaid block produces a red-labelled panel with the Kroki error message, not garbled output or silence.

## Implementation note

This behaviour was already implemented as part of CV0.E1.S1's render pipeline. The `buildPiFenceOutputMessage` function in `messages.ts` produces an error-kind message with the error text as content. The renderer in `renderer.ts` paints the label in red and shows the text body. Unit test (`renderer.test.ts` line 229) and the error branch in `kroki.test.ts` both verify this path.

Retroactively closed because the behaviour exists, is tested, and matches the done criterion. No new code needed.
