/**
 * Canonical sources for every text-body Kroki language that returns a
 * PNG on the public endpoint (`https://kroki.io/<tag>/png`), committed
 * as of CV0.E1.S4's research pass.
 *
 * This file is the single source of truth the live integration suite
 * iterates over (`tests/integration/kroki.live.test.ts`). Adding a new
 * language is one edit here — the live test picks it up automatically
 * via `for (const spec of KROKI_TEXT_LANGUAGES)`.
 *
 * Why sources live in a fixture, not inline in the test file:
 *   1. The `/fence list` unit tests and any future docs-generation
 *      script can read the same table without duplicating minimal
 *      examples.
 *   2. Per-language calibration of `sizeFloorBytes` is itself a piece
 *      of research findings (e.g. Kroki returns ~300-byte error PNGs
 *      for bad input on some endpoints; a per-language floor catches
 *      that regression). Keeping the floor in the fixture couples it
 *      with the source that produced it.
 *   3. New contributors reading the test file see the shape
 *      immediately rather than scrolling through 17 minimal DSL
 *      snippets.
 *
 * Calibration context — research pass on 2026-04-20:
 *   - Probed with minimal canonical sources against `https://kroki.io`.
 *   - Every entry here returned HTTP 200 + PNG magic (`\x89PNG\r\n\x1a\n`).
 *   - `sizeFloorBytes` calibrated from observed sizes with 30% headroom
 *     downward (so e.g. a 1000-byte observation sets the floor around
 *     700). Tight enough to catch the 300-byte "error PNG" regression,
 *     loose enough to survive Kroki version drift.
 *
 * Deliberately excluded (see `docs/product/kroki-support.md` once the
 * docs commit lands):
 *   - **SVG-only on public endpoint:** `d2`, `bpmn`, `bytefield`, `dbml`,
 *     `nomnoml`, `pikchr`, `svgbob`, `wavedrom`. Kroki answers 400 with
 *     "Unsupported output format: png … Must be one of svg." Without an
 *     SVG\u2192PNG rasterization step or self-hosted Kroki, pi-fence's
 *     inline-PNG path can't serve them.
 *   - **Backend unavailable on public endpoint:** `diagramsnet`. Returns
 *     503 "Connection refused: /127.0.0.1:8005" — Kroki's public
 *     instance lacks the diagrams.net backend wiring.
 *   - **JSON-body languages:** `vega`, `vegalite`, `excalidraw` — covered
 *     by CV0.E1.S5 (JSON-body path), not S4's text flow.
 */

export interface KrokiTextLanguageSpec {
	/** Canonical tag as Kroki names it (also used in the URL path). */
	readonly tag: string;
	/** Minimal source that renders to a non-trivial PNG on Kroki. */
	readonly source: string;
	/** Colloquial alternatives pi-fence maps to `tag` via `KROKI_ALIASES`. */
	readonly aliases: readonly string[];
	/**
	 * Lower bound on the expected PNG size. Live tests assert
	 * `png.length > sizeFloorBytes`. Catches Kroki's 300-byte "error PNG"
	 * regression. Calibrated from the research pass with ~30% headroom.
	 */
	readonly sizeFloorBytes: number;
	/**
	 * Free-form note explaining anything unusual about this language
	 * (template requirements, unusual source syntax, quirks discovered
	 * during the research pass). Optional.
	 */
	readonly note?: string;
}

export const KROKI_TEXT_LANGUAGES: readonly KrokiTextLanguageSpec[] = [
	// --- already supported in pi-fence prior to S4 ---
	{
		tag: "mermaid",
		source: "flowchart LR\n  A --> B",
		aliases: [],
		sizeFloorBytes: 800,
	},
	{
		tag: "graphviz",
		source: "digraph { A -> B }",
		aliases: ["dot"],
		sizeFloorBytes: 2000,
	},
	{
		tag: "plantuml",
		source: "@startuml\nA -> B\n@enduml",
		aliases: ["puml"],
		sizeFloorBytes: 500,
	},

	// --- blockdiag family ---
	{
		tag: "blockdiag",
		source: "{ A -> B }",
		aliases: [],
		sizeFloorBytes: 1400,
	},
	{
		tag: "seqdiag",
		source: "{ A -> B; }",
		aliases: [],
		sizeFloorBytes: 2000,
	},
	{
		tag: "actdiag",
		source: "{ A -> B; lane you { A; B; } }",
		aliases: [],
		sizeFloorBytes: 2000,
	},
	{
		tag: "nwdiag",
		source: "nwdiag { network A { a; b } }",
		aliases: [],
		sizeFloorBytes: 2500,
	},
	{
		tag: "packetdiag",
		source: "{ 0-15: a; 16-31: b; }",
		aliases: [],
		sizeFloorBytes: 800,
	},
	{
		tag: "rackdiag",
		source: "{ 4U; 1: a [4U]; }",
		aliases: [],
		sizeFloorBytes: 1500,
	},

	// --- domain-specific text diagrams ---
	{
		tag: "c4plantuml",
		source:
			"@startuml\n" +
			"!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml\n" +
			"Person(a, \"A\")\n" +
			"System(s, \"S\")\n" +
			"Rel(a, s, \"uses\")\n" +
			"@enduml",
		aliases: [],
		sizeFloorBytes: 10_000,
		note:
			"Pulls the C4-PlantUML stdlib over HTTPS at render time on Kroki's side, which makes " +
			"this live case the slowest of the set (~5\u201310s observed).",
	},
	{
		tag: "ditaa",
		source: "+----+\n| a  |\n+----+\n   |\n+-v--+\n| b  |\n+----+",
		aliases: [],
		sizeFloorBytes: 700,
	},
	{
		tag: "erd",
		source: "[A]\n*id\n\n[B]\n*id\nb_id\n\nA 1--* B",
		aliases: [],
		sizeFloorBytes: 2500,
	},
	{
		tag: "structurizr",
		source:
			"workspace {\n" +
			"  model {\n" +
			"    a = person \"A\"\n" +
			"    s = softwareSystem \"S\"\n" +
			"    a -> s \"uses\"\n" +
			"  }\n" +
			"  views {\n" +
			"    systemContext s {\n" +
			"      include *\n" +
			"      autolayout lr\n" +
			"    }\n" +
			"  }\n" +
			"}",
		aliases: [],
		sizeFloorBytes: 5000,
		note:
			"Requires the full `workspace { model { ... } views { systemContext <id> { ... } } }` " +
			"scaffold; Kroki rejects partial DSL with a parse error.",
	},
	{
		tag: "symbolator",
		source:
			"entity ent1 is\n" +
			"  port(\n" +
			"    a : in std_logic;\n" +
			"    b : out std_logic\n" +
			"  );\n" +
			"end entity;",
		aliases: [],
		sizeFloorBytes: 1500,
		note: "VHDL entity syntax. Symbolator draws pin diagrams from VHDL/Verilog entities.",
	},
	{
		tag: "tikz",
		source:
			"\\documentclass{standalone}\n" +
			"\\usepackage{tikz}\n" +
			"\\begin{document}\n" +
			"\\begin{tikzpicture}\n" +
			"\\draw (0,0) -- (2,1) node[above] {A};\n" +
			"\\end{tikzpicture}\n" +
			"\\end{document}",
		aliases: [],
		sizeFloorBytes: 500,
		note:
			"Full LaTeX document required \u2014 the bare `\\begin{tikzpicture}` block Kroki's docs " +
			"sometimes suggest fails with `LaTeX Error: Missing \\begin{document}`.",
	},
	{
		tag: "umlet",
		source:
			"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>\n" +
			"<diagram program=\"umlet\" version=\"14.2.0\">\n" +
			"  <zoom_level>10</zoom_level>\n" +
			"  <element>\n" +
			"    <id>UMLClass</id>\n" +
			"    <coordinates><x>0</x><y>0</y><w>100</w><h>30</h></coordinates>\n" +
			"    <panel_attributes>A</panel_attributes>\n" +
			"    <additional_attributes/>\n" +
			"  </element>\n" +
			"</diagram>",
		aliases: [],
		sizeFloorBytes: 400,
		note: "UMLet XML format. Verbose but stable.",
	},
	{
		tag: "wireviz",
		source:
			"connectors:\n" +
			"  X1:\n" +
			"    type: D-Sub\n" +
			"    subtype: female\n" +
			"    pinlabels: [DCD, RX, TX, DTR, GND]\n" +
			"\n" +
			"cables:\n" +
			"  W1:\n" +
			"    wirecount: 5\n" +
			"    length: 0.2\n" +
			"    color_code: DIN\n" +
			"\n" +
			"connections:\n" +
			"  -\n" +
			"    - X1: [1-5]\n" +
			"    - W1: [1-5]",
		aliases: [],
		sizeFloorBytes: 15_000,
		note: "YAML connector / cable / connection definitions. Largest PNG observed (\u226526 KB).",
	},

	// --- JSON-source Kroki languages (CV0.E1.S5) ---
	// Source is raw JSON passed as text/plain. Kroki accepts it without
	// wrapping or content-type dispatch — verified against the public
	// endpoint on 2026-04-22.
	{
		tag: "vega",
		source: JSON.stringify({
			$schema: "https://vega.github.io/schema/vega/v5.json",
			width: 200,
			height: 200,
			data: [{ name: "t", values: [{ x: 0, y: 0 }] }],
			marks: [
				{
					type: "rect",
					from: { data: "t" },
					encode: {
						enter: {
							x: { value: 0 },
							width: { value: 100 },
							y: { value: 0 },
							height: { value: 100 },
							fill: { value: "steelblue" },
						},
					},
				},
			],
		}),
		aliases: [],
		sizeFloorBytes: 150,
		note: "Minimal Vega spec drawing one filled rect. Output is small (~250B) because the PNG is mostly transparent.",
	},
	{
		tag: "vegalite",
		source: JSON.stringify({
			$schema: "https://vega.github.io/schema/vega-lite/v5.json",
			data: { values: [{ a: "A", b: 28 }] },
			mark: "bar",
			encoding: {
				x: { field: "a", type: "nominal" },
				y: { field: "b", type: "quantitative" },
			},
		}),
		aliases: ["vega-lite"],
		sizeFloorBytes: 1000,
		note: "Minimal Vega-Lite bar chart.",
	},

	// --- SVG-only Kroki languages (CV5.E1.S1) ---
	// Public endpoint returns SVG only; pi-fence rasterizes locally via
	// @resvg/resvg-js. sizeFloorBytes calibrated from SVG→PNG rasterization
	// on 2026-04-24.
	{
		tag: "d2",
		source: "x -> y: hello",
		aliases: [],
		sizeFloorBytes: 5_000,
		note: "D2 diagram. SVG-only on public Kroki; rasterized locally.",
	},
	{
		tag: "bytefield",
		source: '(defattrs :bg-green {:fill "#a0ffa0"})\n(draw-column-headers)\n(draw-box "A" :bg-green)\n(draw-box "B")',
		aliases: [],
		sizeFloorBytes: 2_000,
		note: "Byte-field diagrams from Clojure-like syntax. SVG-only on public Kroki.",
	},
	{
		tag: "dbml",
		source: 'Table users {\n  id integer [primary key]\n  name varchar\n}',
		aliases: [],
		sizeFloorBytes: 2_000,
		note: "Database Markup Language. SVG-only on public Kroki.",
	},
	{
		tag: "nomnoml",
		source: "[A]->[B]",
		aliases: [],
		sizeFloorBytes: 5_000,
		note: "Simple UML-ish diagrams. SVG-only on public Kroki.",
	},
	{
		tag: "pikchr",
		source: 'box "A"; arrow; box "B"',
		aliases: [],
		sizeFloorBytes: 1_000,
		note: "SQLite project's PIC-derived diagram language. SVG-only on public Kroki.",
	},
	{
		tag: "svgbob",
		source: "+--+\n|  |\n+--+",
		aliases: [],
		sizeFloorBytes: 3_000,
		note: "ASCII-art to SVG. SVG-only on public Kroki.",
	},
	{
		tag: "wavedrom",
		source: JSON.stringify({ signal: [{ name: "clk", wave: "p..." }] }),
		aliases: [],
		sizeFloorBytes: 2_000,
		note: "Digital timing diagrams. JSON source. SVG-only on public Kroki.",
	},
];

/**
 * Convenience: every canonical tag as a readonly string array.
 * The Kroki renderer's `KROKI_CANONICAL_TAGS` export must be a superset
 * of this list (the processor can legitimately accept tags it has no
 * canonical source fixture for, but the converse is a contract violation).
 */
export const KROKI_TEXT_TAGS: readonly string[] = KROKI_TEXT_LANGUAGES.map(
	(l) => l.tag,
);

