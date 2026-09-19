// SERVER-ONLY: uses node:crypto. Not re-exported by ./browser.
import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical';

export const sha256Hex = (input: string | Uint8Array): string => createHash('sha256').update(input).digest('hex');

export const hashCanonical = (value: unknown): string => sha256Hex(canonicalJson(value));
