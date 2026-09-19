// Browser-safe contracts v1: schemas, types, event vocabulary and display-only lifecycle table.
// Deliberately excludes hashing (node:crypto), acceptance evaluation and transition guards,
// which are authoritative and server-only. Enforced by tests/contracts.test.ts.
export * from './primitives';
export * from './canonical';
export * from './records';
export * from './profile';
export * from './lifecycle';
export * from './events';
export * from './adapters';
