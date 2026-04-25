/** `/fence` command policy. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { formatDoctorLines, type DoctorInput } from "./doctor.ts";
import type { ConfigFileStatus } from "./io/config-loader.ts";
import type { Logger } from "./io/logger.ts";
import { createKrokiDockerManager } from "./kroki-docker.ts";
import { formatProcessorLines, listProcessors, type ListProcessorsOptions } from "./list.ts";
import { sendPiFenceListMessage, sendPiFenceDoctorMessage } from "./messages.ts";
import type { Availability, FenceProcessor } from "./processor.ts";
import type { MetricsCollector } from "./metrics.ts";
import { formatMetricsLines } from "./metrics.ts";
import { collectSupportedTags, type BindingResolution } from "./resolve.ts";
import type { ShellRunner } from "./io/shell-runner.ts";

const FENCE_SUBCOMMANDS = ["list", "doctor", "stats", "kroki start", "kroki stop", "kroki status"] as const;

interface ConfigStatus {
	globalPath: string;
	globalStatus: ConfigFileStatus;
	projectPath: string;
	projectStatus: ConfigFileStatus;
}

interface RegisterFenceCommandOptions {
	pi: ExtensionAPI;
	logger: Logger;
	processors: readonly FenceProcessor[];
	availability: ReadonlyMap<string, Availability>;
	bindingRows: readonly BindingResolution[];
	disabled: ReadonlySet<string>;
	endpoints?: Readonly<Record<string, string>>;
	configStatus?: ConfigStatus;
	shell: ShellRunner;
	metrics?: MetricsCollector;
}

export function registerFenceCommand({
	pi,
	logger,
	processors,
	availability,
	bindingRows,
	disabled,
	endpoints,
	configStatus,
	shell,
	metrics,
}: RegisterFenceCommandOptions): void {
	const listOpts: ListProcessorsOptions = { disabled, endpoints };
	const dockerMgr = createKrokiDockerManager(shell, logger);

	pi.registerCommand("fence", {
		description: "List or inspect pi-fence processors (usage: /fence list, /fence doctor)",
		handler: async (args, ctx) => {
			const subcommand = args.trim().split(/\s+/)[0] ?? "";
			logger.debug("command", "/fence invoked", { subcommand });
			if (subcommand === "list") {
				sendPiFenceListMessage(pi, processors, availability, bindingRows, disabled, endpoints);
				return;
			}
			if (subcommand === "doctor") {
				const listings = listProcessors(processors, availability, listOpts);
				const processorLines = formatProcessorLines(listings, bindingRows);
				const input: DoctorInput = {
					globalPath: configStatus?.globalPath ?? "(unknown)",
					globalStatus: configStatus?.globalStatus ?? "not-found",
					projectPath: configStatus?.projectPath ?? "(unknown)",
					projectStatus: configStatus?.projectStatus ?? "not-found",
					listings,
					bindingRows,
					allTags: collectSupportedTags(processors),
				};
				const doctorLines = formatDoctorLines(input, processorLines);
				sendPiFenceDoctorMessage(pi, doctorLines);
				return;
			}
			if (subcommand === "stats") {
				if (!metrics) {
					ctx.ui.notify("Metrics not available.", "warning");
					return;
				}
				const summary = metrics.getSummary();
				const lines = formatMetricsLines(summary);
				sendPiFenceDoctorMessage(pi, lines);
				return;
			}
			if (subcommand === "kroki") {
				const krokiSub = args.trim().split(/\s+/)[1] ?? "";
				await handleKrokiSubcommand(krokiSub, dockerMgr, ctx);
				return;
			}
			notifyUnknownSubcommand(ctx, subcommand);
			logger.warn("command", "unknown subcommand", { subcommand });
		},
	});
}

interface NotifyContext {
	ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}

async function handleKrokiSubcommand(
	sub: string,
	mgr: ReturnType<typeof createKrokiDockerManager>,
	ctx: NotifyContext,
): Promise<void> {
	if (sub === "start") {
		const result = await mgr.start();
		ctx.ui.notify(result.message, result.ok ? "info" : "error");
		return;
	}
	if (sub === "stop") {
		const result = await mgr.stop();
		ctx.ui.notify(result.message, result.ok ? "info" : "error");
		return;
	}
	if (sub === "status") {
		const result = await mgr.status();
		ctx.ui.notify(result.message, "info");
		return;
	}
	const available = ["start", "stop", "status"].join(", ");
	const prefix = sub === "" ? "No kroki subcommand given" : `Unknown kroki subcommand '${sub}'`;
	ctx.ui.notify(`${prefix}. Available: ${available}`, "warning");
}

function notifyUnknownSubcommand(ctx: NotifyContext, subcommand: string): void {
	const available = FENCE_SUBCOMMANDS.join(", ");
	const prefix = subcommand === "" ? "No subcommand given" : `Unknown subcommand '${subcommand}'`;
	ctx.ui.notify(`${prefix}. Available: ${available}`, "warning");
}
