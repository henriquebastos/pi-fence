export interface ReportTask {
	serverUrl: string;
	projectKey: string;
	ceTaskId: string;
	dashboardUrl?: string;
}

export interface SonarCeTask {
	id: string;
	status: string;
	componentKey?: string;
	analysisId?: string;
	submittedAt?: string;
	startedAt?: string;
	executedAt?: string;
	executionTimeMs?: number;
	warningCount?: number;
	warnings?: string[];
	errorMessage?: string;
	errorStacktrace?: string;
}

export interface CeTaskResponse {
	task: SonarCeTask;
}

export interface SonarQualityGateCondition {
	status: string;
	metricKey: string;
	comparator?: string;
	errorThreshold?: string;
	actualValue?: string;
}

export interface SonarQualityGateProjectStatus {
	status?: string;
	conditions?: SonarQualityGateCondition[];
	ignoredConditions?: boolean;
	caycStatus?: string;
}

export interface QualityGateResponse {
	projectStatus?: SonarQualityGateProjectStatus;
}

export interface SonarMeasure {
	metric: string;
	value?: string;
	bestValue?: boolean;
}

export interface MeasuresResponse {
	component?: {
		key?: string;
		name?: string;
		qualifier?: string;
		measures?: SonarMeasure[];
	};
}

export interface SonarIssue {
	rule: string;
	severity: string;
	component: string;
	line?: number;
	message: string;
}

export interface IssuesResponse {
	total: number;
	issues: SonarIssue[];
}

export interface CountBySeverity {
	severity: string;
	count: number;
}

export interface CountByRule {
	rule: string;
	count: number;
}

export interface CountByLane {
	lane: string;
	count: number;
}

export interface TopFileCount {
	component: string;
	count: number;
}

export interface Summary {
	projectKey: string;
	serverUrl: string;
	dashboardUrl?: string;
	ceTaskId: string;
	ceTaskStatus: string;
	qualityGateStatus: string | null;
	issuesTotal: number;
	issuesBySeverity: CountBySeverity[];
	issuesByRule: CountByRule[];
	issuesByLane: CountByLane[];
	topFiles: TopFileCount[];
	measures: Record<string, string>;
}

export interface SonarReportBundle {
	ceTask: CeTaskResponse;
	qualityGate: QualityGateResponse;
	measures: MeasuresResponse;
	issues: IssuesResponse;
}
