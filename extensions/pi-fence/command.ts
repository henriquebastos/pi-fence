/** `/fence` command policy. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { formatDoctorLines, type DoctorInput } from "./doctor.ts";
import type { ConfigFileStatus } from "./io/config-loader.ts";
import type { Logger } from "./io/logger.ts";
import { formatProcessorLines, listProcessors, type ListProcessorsOptions } from "./list.ts";
import { sendPiFenceListMessage, sendPiFenceDoctorMessage } from "./messages.ts";
import type { Availability, FenceProcessor } from "./processor.ts";
import { collectSupportedTags, type BindingResolution } from "./resolve.ts";

const FENCE_SUBCOMMANDS = ["list", "doctor"] as const;

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
}: RegisterFenceCommandOptions): void {
	const listOpts: ListProcessorsOptions = { disabled, endpoints };

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
			notifyUnknownSubcommand(ctx, subcommand);
			logger.warn("command", "unknown subcommand", { subcommand });
		},
	});
}

interface NotifyContext {
	ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}

function notifyUnknownSubcommand(ctx: NotifyContext, subcommand: string): void {
	const available = FENCE_SUBCOMMANDS.join(", ");
	const prefix = subcommand === "" ? "No subcommand given" : `Unknown subcommand '${subcommand}'`;
	ctx.ui.notify(`${prefix}. Available: ${available}`, "warning");
}
