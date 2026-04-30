export const DEFAULT_FENCE_SOURCE_MAX_BYTES = 262_144;
export const DEFAULT_PROCESSOR_OUTPUT_MAX_BYTES = 10_485_760;

export function formatByteLimitError(label: string, actualBytes: number, maxBytes: number): string {
	return `${label} is too large: ${actualBytes} bytes exceeds limit of ${maxBytes} bytes`;
}
