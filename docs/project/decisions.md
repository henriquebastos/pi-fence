[< Docs](../README.md)

# Decisions

Incremental decisions made during construction. Chronological — oldest first, newest appended at the bottom. For foundational decisions made before code (D1–D8), see the [Briefing](briefing.md).

Each entry follows the shape: **context → rule → why → consequences**.

---

## Entries

### 2026-04-18 — Drop processor priority; tag conflicts resolved by explicit user binding

**Context.** The briefing's original D3, D5, and D6 referenced a numeric `priority` field on every processor, with the registry sorting by it to resolve cases where more than one processor claimed the same tag. The model showed up in several docs (principles.md, roadmap/README.md, CV0.E1 epic spec, CV0.E2.S2 story title) before any code was written.

**Rule.** Processors do not carry priority. When more than one processor is registered for a tag, resolution is:

1. If the user bound that tag to a specific named processor in settings, that processor is used.
2. Otherwise, the first registered *and available* processor for the tag wins.

**Why.** Priority-as-number suggests fine-grained ordering that nobody actually needs and that would have to be specified by every processor author. What users really want to say is “for `mermaid`, use `mermaid-local`” — a binding, not a number. Moving the concern out of the core and into user config makes the core smaller (no priority field on the interface, no sort in the resolver), makes the user’s intent explicit (named binding, not a tuning knob), and improves the command UX (`/fence set mermaid mermaid-local` reads better than `/fence priority mermaid-local 10`).

**Consequences.**

- `FenceProcessor` has one less field. Resolution is a lookup, not a sort.
- CV0.E2.S2 was renamed from *“I configure processor priority in settings”* to *“I bind a tag to a specific processor in settings”*.
- The `Control` Community Value definition was tightened from *“what is processed, how, at what priority”* to *“what is processed and how”*.
- D3, D5, D6, D7 in the briefing were reworded: Kroki “fallback path” is now “overriding per tag”; third-party registration notes “first registered and available wins”; `passthrough` rationale no longer mentions “lower-priority processors”.
- No code impact yet — S1 has a single hardcoded processor. The simplification lands before CV0.E2 introduces a second processor.

### 2026-04-18 — Drop the `render_fence` tool; interception-only with in-turn error follow-up

**Context.** The briefing's original D2 described hybrid activation: interception by default plus an optional `render_fence` tool the LLM could call for parse feedback or explicit parameters. The rationale for the tool leaned on two benefits: (1) the LLM could pre-validate a diagram before emitting it, and (2) the LLM could pass parameters like theme or size cleanly.

**Rule.** Activation is interception-only. No `render_fence` tool is exposed. When a processor returns an error, pi-fence does two things:

1. Surfaces a readable error panel in place of the would-be image, so the user never sees garbled output — only either a rendered diagram or a clear error.
2. Injects the error as a follow-up message via `pi.sendMessage(..., { deliverAs: "followUp" })`, so the LLM sees the failure **in the same turn it wrote the broken block** and can correct immediately, without waiting for the next user prompt.

Parameters are carried by the fenced info string (```` ```mermaid theme=dark width=800 ````), not by a tool argument.

**Why.** The tool's only unique benefit was pre-validation. In practice, modern LLMs get common diagram syntax right on the first try; the few cases where they don't are handled equally well by the follow-up loop, which costs at most one extra LLM turn to correct. Against that marginal benefit, the tool adds permanent cost: a description in every system prompt, a second rendering code path, and ambiguity for the LLM about "should I write a block or call a tool?" Removing it simplifies the briefing, the code, and the LLM-facing surface all at once.

**Consequences.**

- D2 in the briefing was rewritten to describe interception + follow-up error injection, with no tool.
- CV1.E2 was renamed from *Hybrid Mode* to *Error Feedback Loop*. Its stories are now: S1 “I see readable errors in place of broken diagrams”, S2 “The LLM receives render errors as follow-ups and corrects in the same turn”.
- CV0.E1 epic spec deferred-list entry and CV0.E1.S1 out-of-scope list updated: “Tool `render_fence`” became “Error feedback surface / follow-up injection”.
- No code impact on S1. The follow-up injection lands when CV1.E2 is implemented. Until then, S1 can surface errors as text content in the custom message and the LLM simply won't see them until the next user prompt — acceptable for the first happy-path release.

### 2026-04-18 — Config lives in `settings.json` under `"pi-fence"`; defaults in code

**Context.** D6 originally said “everything about the registry is configurable in `settings.json` and `.pi/settings.json`” without saying what that meant concretely. During a file-first-loop review the user asked four sharp questions: why `settings.json` rather than a dedicated file, how other extensions handle this, whether pi offers a good abstraction, and whether we require the user to create config data or ship sensible defaults.

Investigation of pi's source (`dist/core/settings-manager.d.ts`) confirmed that pi's `SettingsManager` has typed getters for pi-core’s own fields only. There is no general-purpose API for extensions to read arbitrary user-edited config. Extensions in the ecosystem either read `settings.json` directly themselves, use `pi.appendEntry` for internal state, or invent their own config file.

**Rule.**

1. Configuration lives under a single `"pi-fence"` key in pi's `settings.json` (global) and `.pi/settings.json` (project). Project overrides global.
2. Pi-fence reads and merges both files itself, on startup and on `/fence reload`.
3. All defaults live in code. The settings file is optional. Missing file, missing keys, and malformed values fall back to defaults gracefully, with at most a single warning on bad values.
4. The user never has to create a file, a directory, or declare anything for pi-fence to function on first install.

**Why.**

- Pi users already curate `settings.json`. Adding a second config file forces them to learn another surface for no benefit.
- Pi's global-vs-project-override rules are already correct for what we want; reusing them avoids reinventing the merge.
- A namespaced key (`"pi-fence"`) prevents collisions with pi-core and other extensions.
- Defaults in code keeps the first-install experience zero-friction — ```mermaid renders without any setup.
- Pi’s lack of an extension-scoped settings API is real but small: reading two JSON files and merging them is ~30 lines of code. Not worth building a separate mechanism around.

**Consequences.**

- Pi-fence ships a `config.ts` module that defines defaults, reads the two files, validates, merges, and exposes a typed `getConfig()` function to the rest of the extension.
- A `/fence reload` command re-reads the files at runtime, so users can edit settings without restarting pi.
- Documentation for configuration lives in `docs/getting-started.md` under an “Advanced” section — the main path assumes defaults.
- Schema of the `"pi-fence"` key is versioned in code and documented in getting-started, not in `briefing.md` (briefing is for rationale; schema is a product detail).

> **Superseded** by *Adopt `@zenobius/pi-extension-config` with a per-extension config file* (below).

### 2026-04-18 — Adopt `@zenobius/pi-extension-config` with a per-extension config file (supersedes the `"pi-fence"`-under-`settings.json` decision)

**Context.** The user asked whether my previous D6 answer reflected how the ecosystem actually handles per-extension config. It did not. I had only sampled two extensions and extrapolated. A full survey of every extension currently installed under `~/.pi/agent/git/` showed three patterns: (A) manual per-extension JSON under `~/.pi/agent/settings/<name>.json` using `getAgentDir()` (pi-leash, pi-image-gen); (B) per-extension JSON managed by the library `@zenobius/pi-extension-config`, living at `~/.pi/agent/<name>.config.json` + `.pi/<name>.config.json` (pi-worktrees); (C) no user-facing config at all (most extensions). **Zero** extensions use a key under `settings.json` as I had proposed.

**Rule.** pi-fence uses pattern B. It depends on `@zenobius/pi-extension-config` and delegates config discovery, layered resolution, parsing, migrations, and event lifecycle to that library.

Resolution order (highest priority first):

1. Environment variables (`PI_FENCE_*`).
2. Project config at `<cwd>/.pi/pi-fence.config.json`.
3. Home config at `~/.pi/agent/pi-fence.config.json`.
4. Defaults defined in code.

Defaults cover the first-install experience: Kroki endpoint at `https://kroki.io`, interception on, no processor bindings. Every key in the config file is optional.

**Why.**

- **Ecosystem consistency.** Users who already have pi-leash, pi-image-gen, and pi-worktrees configured see a familiar shape and location for pi-fence. Burying our config under `settings.json` would be a lone outlier.
- **Namespace hygiene.** A malformed pi-fence config cannot break pi-core's settings parsing. Each extension’s JSON lives in its own file.
- **No reinvented wheel.** pi-leash and pi-image-gen each carry their own manual layered-config implementation. pi-worktrees adopted the library and deleted theirs. We skip the intermediate step and start with the library.
- **Migrations and env overrides for free.** We get a migration chain, typed validation hooks, and `PI_FENCE_*` env overrides without writing any of that code. Env overrides in particular are valuable for Docker users running Kroki locally.

**Consequences.**

- **Superseding the previous decision.** The prior entry (*“Config lives in `settings.json` under `"pi-fence"`; defaults in code”*) is marked superseded. It reflected an incomplete survey; this entry replaces its rule but keeps the spirit (defaults in code, graceful degradation, user never has to create a file).
- **New dependency.** `@zenobius/pi-extension-config` will land as a runtime dependency when the config module is implemented in CV1.E1. It is not added yet — there is nothing to use it for in S1. ~10 KB, actively maintained (0.2.0 at time of decision, published April 2026).
- **Config module shape.** The extension exposes a single `getConfig()` function, backed by `createConfigService<PiFenceConfig>("pi-fence", { defaults, parse })`. Schema defined with TypeBox to match the rest of the ecosystem.
- **Command surface.** `/fence reload` calls `service.reload()`. Future `/fence doctor` can call `service.config` to show the effective config alongside processor availability.
- **Documentation.** `docs/getting-started.md` documents only the file locations and the defaults-just-work story. The schema reference lives next to the code.
- **Code impact timing.** The config module lands during CV1.E1 (Explicit Configuration), not in S1. S1 has one hardcoded processor and no config surface to expose.

### 2026-04-18 — Testing architecture: `Verifiability` CV type, four layers, fakes-not-mocks, Docker for live deps

**Context.** The user surfaced a worry that the project was accumulating features without a serious testing plan. They asked for: logs/traces to inspect side effects, fully-automated reproduction of the user experience, no mocks where avoidable, pure functions with dependency injection, explicit test organization, and a roadmap-level recognition that testing matters. A 22-extension survey of the ecosystem was run to check how pi extensions typically test. Most ship none; the coding-agent core itself uses vitest with real temp dirs, inline extension factories, and `session.agent.streamFn` swapping for fake LLMs. This decision locks in the testing architecture we will use and elevates verifiability to a first-class framework concern.

**Rule.**

1. **Verifiability is a Community Value type.** Added alongside Legibility, Extensibility, Control, Portability. It is cross-cutting: every story implicitly advances it through passing tests; stories whose primary delivery is testing infrastructure earn explicit progression credit in the roadmap.
2. **Test runner: vitest.** Consistent with the rest of the pi ecosystem and with principles.md’s “TypeScript-native, minimal config” rule.
3. **Four test layers, each with its own location and runner gate:**
   - **Unit** (`tests/unit/`) — pure logic, no I/O, no fakes. `pnpm test`.
   - **Contract** (`tests/contract/`) — any implementation of a published interface satisfies it. `pnpm test`.
   - **Extension** (`tests/extension/`) — pi-fence running inside a real pi SDK `AgentSession` with a fake LLM stream (via `session.agent.streamFn = ...`). `pnpm test`.
   - **Integration / live** (`tests/integration/`) — real processors against real binaries (Docker container) or real HTTP (`kroki.io` or a local Kroki container). `pnpm test:live`.
4. **Fakes, not mocks.** `FakeHttpClient`, `FakeShellRunner`, `FakeLogger`, `FakeExtensionAPI` live under `tests/utilities/`. Real in-memory objects with capture arrays, not `vi.mock()`-style module interception. The distinction is load-bearing; the word “mock” is reserved for the bad sense.
5. **Dependency injection at every I/O seam.** Three interfaces anchor the seams: `HttpClient`, `ShellRunner`, `Logger`. Production wires node impls; tests wire fakes; live tests wire “real” impls that run inside the Docker container when needed.
6. **Live dependencies live in a Docker image**, `ghcr.io/henriquebastos/pi-fence-live-deps:<version>`. The image starts minimal (graphviz only at S0) and grows as each processor story lands. Hosts run the image as a long-lived named container (`pi-fence-live-deps`); live tests talk to it via a `DockerExecShellRunner` that wraps binary calls in `docker exec`.
   - Fast CI runs only fake-based tests (`pnpm test`); no Docker, no network.
   - Pre-release / nightly CI pulls the image, starts the container, and runs `pnpm test:live`.
   - Windows contributors run live tests via Docker Desktop.
   - Mac/Linux contributors the same.
   - Image is tagged `:latest` for convenience and `:<sha>` for CI determinism; local scripts can pin to a version file.
7. **Every story spec has a mandatory `Tests` section** listing: layers touched, events/interactions covered, fakes added, live tests added, anything deferred.
8. **No test touches the real filesystem outside `os.tmpdir()`** or the real `~/.pi/agent/`. Tests create per-test temp dirs and clean up in `afterEach`.

**Why this shape.**

- **vitest + real temp dirs** is the pattern pi-coding-agent's own test suite uses. Reusing it lowers the learning curve for anyone moving between the projects.
- **Four layers separate concerns cleanly.** Unit tests stay fast; contract tests let third-party processor authors verify conformance; extension tests exercise the event-hook path end-to-end without an LLM; live tests guard against real-world rendering drift.
- **Docker for live deps beats per-host install scripts** on reproducibility (byte-identical `dot` output across machines), on Windows support (Docker Desktop makes live tests work there too), on maintenance (one Dockerfile vs. a brew/apt/dnf matrix), and on host safety (no global `mmdc` install polluting dev machines). The cost (one-time image pull per version) is bounded.
- **Fakes over mocks** keeps tests talking to real code paths, with all the shape fidelity that comes with it. Refactors that rename a function don’t break tests that mocked it; they do break tests that imported it.
- **Mandatory `Tests` section in story specs** is the tripwire against the user's original concern about stories shipping without coverage. It surfaces gaps at spec-review time, not at commit-review time.
- **Verifiability as a CV type** elevates this work to first-class roadmap status. A story that skips its tests is not merely against a style guide; it fails to advance a named community value.

**Consequences.**

- `CV0.E1.S0` (“Testing foundation”) is inserted before `S1` in the Epic. It ships the `tests/` tree, the Dockerfile, the utility interfaces, exemplar tests at each layer, and the mandatory-Tests-section convention in story specs.
- The `Verifiability` type is added to the CV types table in both `briefing.md` and `roadmap/README.md` (legend) with a note that it is cross-cutting.
- `principles.md` now carries an expanded Testing section naming the layers, the fake/mock distinction, the live-deps policy, the DI rule, the no-host-fs rule, and the mandatory `Tests` section in plans.
- `S1`'s plan will be updated (in Draft 2 of this change set) to include a Tests section and reorder its implementation steps so tests come first.
- Future story specs without a `Tests` section are incomplete and get sent back before approval.
- The Docker image is a separate deliverable tracked under CV0.E1.S0. It is **not** a dependency of `pnpm test` — that would re-couple what the layer split was meant to separate.
- This entry supersedes nothing; it extends the framework. No earlier decision is retired.

### 2026-04-30 — Store only a bounded source preview in pi-fence custom-message details

**Context.** CV11.E2.S1 inspected pi source from `~/me/oss/pi-mono` at `upstream/main` commit `156a9052bc08a5ed08b7f2b82a27796253c4760d`.

Evidence from `packages/coding-agent/src/core/messages.ts`, `session-manager.ts`, `agent-session.ts`, `sdk.ts`, `modes/interactive/components/custom-message.ts`, `modes/interactive/components/tree-selector.ts`, `modes/interactive/interactive-mode.ts`, `core/export-html/index.ts`, and `core/export-html/template.js`:

1. `CustomMessage.details` is persisted on `custom_message` session entries. `SessionManager.appendCustomMessageEntry()` writes `details`, and the JSONL session file serializes the whole entry.
2. `details` does not reach the model by default. `buildSessionContext()` reconstructs custom messages with details for runtime/rendering, but `convertToLlm()` converts custom messages to user messages from `content` only.
3. Compaction summarizes LLM-visible message content; it does not need `details`. Old JSONL entries remain append-only history, while active context after compaction only includes the compaction summary plus kept entries.
4. Custom renderers receive only their `CustomMessage`. A pi-fence renderer cannot reliably recover the original assistant fenced block unless pi-fence carries source-derived data in its custom message.
5. Export/share surfaces include `details`: HTML export base64-embeds `JSON.stringify(sessionData)` with all entries, the HTML viewer can download those entries as JSONL, `/share` uploads that HTML to a secret gist, and the TUI debug log serializes agent messages.

**Rule.** pi-fence custom output details must not retain full raw fence source. They may retain a bounded source preview needed by the expanded render UI, plus metadata such as tag, processor, and render kind. The preview is clipped before `pi.sendMessage()` so JSONL persistence, HTML export, share gists, and debug logs never receive an unbounded second copy from pi-fence.

When CV11.E3/CV11.E5 touch message and output types, replace the current `details.source` full-source field with an explicit preview shape such as `sourcePreview` (name to be finalized in code) and tolerate legacy `details.source` only for reading old sessions if needed.

**Options considered.**

1. **Full source.** Keeps today's richest expanded view, but duplicates the assistant fenced block in persisted `details` and every export/share/debug surface.
2. **Clipped preview.** Chosen. Preserves the bounded expanded UI while bounding duplicate retention.
3. **Hash/reference.** Avoids duplication, but pi has no built-in source lookup for custom renderers, so it would remove copyable expanded content unless pi-fence builds a new artifact index.
4. **No source.** Minimizes retention, but removes a useful expanded-source view even though a bounded preview is enough for the current UI.

**Why.** The original assistant message already contains the fenced source. Duplicating the full source in custom-message details increases retention and export/share exposure without improving LLM context: pi excludes details from provider-bound messages. A bounded preview keeps pi-fence's visible debugging affordance while making the trust boundary explicit and compatible with upcoming render limits.

**Consequences.**

- CV11.E3.S2 should model pi-fence output details as explicit metadata plus a retained preview, not an arbitrary full-source bag.
- CV11.E5.S1 should enforce source/output limits before custom message construction, including the persisted preview bytes.
- A future full-source copy action should be explicit, for example via an artifact/reference flow, not automatic retention in `details`.
- Existing sessions that already contain `details.source` are historical data; this decision does not require rewriting session JSONL files.
