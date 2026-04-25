# CV8.E2.S2 — CSV parser embedded newlines

**Status:** Dropped

**Epic:** [CV8.E2 — Robustness](cv8-e2--robustness.md)
**Date:** 2026-04-25 (spec)

## Summary

The CSV parser splits input on `\n` before field parsing. RFC 4180 allows newlines inside quoted fields. Downgraded to a known-limitation doc note — LLM-generated CSV in fenced blocks is unlikely to produce embedded newlines, and the parser rewrite cost doesn't justify the marginal correctness gain.

## Decision

Dropped. Document as a known limitation in the table processor's module comment.
