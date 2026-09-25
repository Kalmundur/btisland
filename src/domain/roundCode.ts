export const ROUND_CODE_LENGTH = 6;

/** Keeps digits only and caps the length – tolerant of pasted "482 913" or "482-913". */
export function normalizeRoundCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, ROUND_CODE_LENGTH);
}

export function isCompleteRoundCode(code: string): boolean {
  return code.length === ROUND_CODE_LENGTH && /^[0-9]+$/.test(code);
}

/** "482913" -> "482 913" for display. */
export function formatRoundCode(code: string): string {
  return code.length === ROUND_CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
