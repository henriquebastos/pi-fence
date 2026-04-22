/**
 * graphviz-local's conformance to the `FenceProcessor` contract.
 *
 * Uses `FakeShellRunner` to program deterministic responses — no
 * subprocess, no filesystem. Live conformance against the real `dot`
 * binary inside the `pi-fence-live-deps` container is a separate
 * integration test (`tests/integration/graphviz-local.live.test.ts`,
 * CV0.E2.S1 step 8).
 *
 * The contract helper's `badSource` probe requires the processor to
 * return `{ ok: false, error }` on bad input. FakeShellRunner is
 * programmed to peek at `opts.input` and respond with exit 0 + PNG
 * bytes for the good source, non-zero exit + stderr for the bad one.
 * This mirrors `tests/contract/kroki.contract.test.ts`'s shape —
 * FakeHttpClient peeks at the request body to decide which response
 * to return.
 */

import { FakeShellRunner, type ShellResult } from "../utilities/shell-runner.ts";
import {
	createGraphvizLocalProcessor,
	GRAPHVIZ_LOCAL_CANONICAL_TAGS,
} from "../../extensions/pi-fence/graphviz-local.ts";
import { runFenceProcessorContract } from "./fence-processor.ts";

const TINY_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef,
]);

const GOOD_SOURCE = "digraph { A -> B }";
const BAD_SOURCE = "digraph { A ->";

/**
 * Small ShellRunner wrapper over FakeShellRunner that peeks at the
 * stdin input to pick between good-source and bad-source responses.
 * FakeShellRunner's `setResponse` keys on (cmd, args) which are the
 * same for both sources (`dot -Tpng`) — peeking at `opts.input` is
 * the only way to route. Same pattern kroki.contract.test.ts uses for
 * FakeHttpClient: it peeks at `req.body` to choose the response.
 */
function makeGraphvizLocal(): ReturnType<typeof createGraphvizLocalProcessor> {
	const badShellResult: ShellResult = {
		stdout: "",
		stderr: "Error: <stdin>:1: syntax error, unexpected end of file",
		exitCode: 1,
	};
	const goodShellResult: ShellResult = {
		stdout: "",
		stdoutBuffer: TINY_PNG,
		stderr: "",
		exitCode: 0,
	};

	const inner = new FakeShellRunner();
	// `dot -V` for the available() shape assertion.
	inner.setResponse("dot", ["-V"], {
		stdout: "",
		stderr: "dot - graphviz version 2.50.0 (0)",
		exitCode: 0,
	});

	const shell = {
		async run(cmd: string, args: string[], opts?: { input?: string; signal?: AbortSignal }): Promise<ShellResult> {
			if (opts?.signal?.aborted) {
				throw new DOMException("The operation was aborted.", "AbortError");
			}
			// dot -V is for the available() probe — delegate to inner.
			if (cmd === "dot" && args.length === 1 && args[0] === "-V") {
				return inner.run(cmd, args, opts);
			}
			// dot -Tpng — route by the stdin source.
			if (cmd === "dot" && args.length === 1 && args[0] === "-Tpng") {
				return opts?.input === BAD_SOURCE ? badShellResult : goodShellResult;
			}
			throw new Error(`unexpected shell call: ${cmd} ${args.join(" ")}`);
		},
	};

	return createGraphvizLocalProcessor(shell);
}

runFenceProcessorContract("graphviz-local", makeGraphvizLocal, {
	tag: GRAPHVIZ_LOCAL_CANONICAL_TAGS[0],
	goodSource: GOOD_SOURCE,
	badSource: BAD_SOURCE,
});
