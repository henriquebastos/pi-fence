import type {
	SandboxComponentStatus,
	SandboxState,
	SandboxStatus,
} from "../../extensions/pi-fence/sandbox.ts";

export interface TestSandboxStatus {
	state: SandboxState;
	message: string;
	endpoint?: string;
	components?: readonly SandboxComponentStatus[];
}

export function sandboxStatus(status: TestSandboxStatus): SandboxStatus {
	if (status.state === "ready") {
		return status.endpoint
			? {
				kind: "ready-service",
				state: "ready",
				message: status.message,
				endpoint: status.endpoint,
				...(status.components ? { components: status.components } : {}),
			}
			: {
				kind: "ready-exec",
				state: "ready",
				message: status.message,
				...(status.components ? { components: status.components } : {}),
			};
	}
	return {
		kind: status.state,
		state: status.state,
		message: status.message,
		...(status.components ? { components: status.components } : {}),
	} as SandboxStatus;
}
