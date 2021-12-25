export function isNotEmptyString(value: any) {
	return typeof value === 'string' && value.trim().length > 0;
}