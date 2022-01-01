export function isNotEmptyString(value: any) {
    return typeof value === 'string' && value.trim().length > 0;
}

export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
