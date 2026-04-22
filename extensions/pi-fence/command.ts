/** `/fence` command policy. */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { Logger } from "./io/logger.ts";
import { sendPiFenceListMessage } from "./messages.ts";
import type { Availability, FenceProcessor } from "./processor.ts";
import type { BindingResolution } from "./resolve.ts";

const FENCE_SUBCOMMANDS = ["list"] as const;

interface RegisterFenceCommandOptions {
	pi: ExtensionAPI;
	logger: Logger;
	processors: readonly FenceProcessor[];
	availability: ReadonlyMap<string, Availability>;
	bindingRows: readonly BindingResolution[];
}

export function registerFenceCommand({
	pi,
	logger,
	processors,
	availability,
	bindingRows,
}: RegisterFenceCommandOptions): void {
	pi.registerCommand("fence", {
		description: "List or inspect pi-fence processors (usage: /fence list)",
		handler: async (args, ctx) => {
			const subcommand = args.trim().split(/\s+/)[0] ?? "";
			logger.debug("command", "/fence invoked", { subcommand });
			if (subcommand === "list") {
				sendPiFenceListMessage(pi, processors, availability, bindingRows);
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
