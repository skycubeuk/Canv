// Mirror of electron/services/fs-limits.cjs. Both files must hold the same value.
// Renderer code can also read window.canvHost.limits.maxOpenBytes (exposed via preload)
// if it needs the host-authoritative value; this module is the build-time default.
export const MAX_OPEN_BYTES = 10 * 1024 * 1024 // 10 MB
