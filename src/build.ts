// The release this build's code was last numbered as, the commit it was built from, and whether it had changes git
// hadn't committed (PLAN §8, "Releases"). The app's build sets them from package.json and git (vite.config.ts); where
// nothing sets them, as in the Node scripts, the release is unknown, the commit null and the build clean.

declare const __WORMLIGHT_RELEASE__: string | undefined;
declare const __WORMLIGHT_COMMIT__: string | null | undefined;
declare const __WORMLIGHT_DIRTY__: boolean | undefined;

export const RELEASE: string = typeof __WORMLIGHT_RELEASE__ === 'string' ? __WORMLIGHT_RELEASE__ : 'unknown';
export const COMMIT: string | null = typeof __WORMLIGHT_COMMIT__ === 'string' ? __WORMLIGHT_COMMIT__ : null;
export const DIRTY: boolean = typeof __WORMLIGHT_DIRTY__ === 'boolean' ? __WORMLIGHT_DIRTY__ : false;
