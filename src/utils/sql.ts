import { readFileSync } from 'node:fs';

export function readSqlFile(filename: string): string {
  return readFileSync(new URL(`../sql/${filename}`, import.meta.url), 'utf-8');
}
