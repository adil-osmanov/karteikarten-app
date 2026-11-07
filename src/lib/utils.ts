import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Очищает перевод от склеенных контекстов, переводов строк и вторичных блоков `auch: ...`
 */
export function getCleanTranslation(rawTranslation?: string | null): string {
  if (!rawTranslation) return '';
  return rawTranslation
    .split(/\n|auch:/i)[0]
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

