import { describe, expect, it } from "vitest";

import { buildInspectPlan, getMissingSonarEnv } from "../../scripts/inspect.ts";

describe("inspect command planning", () => {
	it("requires both sonar env vars before scheduling the sonar step", () => {
		expect(getMissingSonarEnv({})).toEqual(["SONAR_HOST_URL", "SONAR_TOKEN"]);
		expect(getMissingSonarEnv({ SONAR_HOST_URL: "http://localhost:9000" })).toEqual([
			"SONAR_TOKEN",
		]);
		expect(getMissingSonarEnv({ SONAR_TOKEN: "token" })).toEqual(["SONAR_HOST_URL"]);
	});

	it("always includes inspect:crap and skips sonar clearly when unconfigured", () => {
		const plan = buildInspectPlan({});

		expect(plan).toEqual([
			{ script: "inspect:crap" },
			{
				script: "inspect:sonar",
				requiredEnv: ["SONAR_HOST_URL", "SONAR_TOKEN"],
				skipReason: "missing SONAR_HOST_URL, SONAR_TOKEN",
			},
		]);
	});

	it("runs sonar when both required env vars are present", () => {
		const plan = buildInspectPlan({
			SONAR_HOST_URL: "http://localhost:9000",
			SONAR_TOKEN: "secret",
		});

		expect(plan).toEqual([
			{ script: "inspect:crap" },
			{
				script: "inspect:sonar",
				requiredEnv: ["SONAR_HOST_URL", "SONAR_TOKEN"],
			},
		]);
	});
});
