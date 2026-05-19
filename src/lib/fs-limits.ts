// Mirror of electron/services/fs-limits.cjs. Both files must hold the same value;
// electron/fs-limits.test.cjs asserts this. The constant is NOT exposed via
// preload — Electron's sandboxed preload only permits a small allowlist of
// requires (electron, events, timers, url) and cannot resolve relative paths.
export const MAX_OPEN_BYTES = 10 * 1024 * 1024 // 10 MB
