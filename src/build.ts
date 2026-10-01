// The release this build's code was last numbered as, and the commit it was built from (PLAN §8, "Releases"). The
// app's build sets both from package.json and git (vite.config.ts); where nothing sets them, as in the Node scripts,
// the release is unknown and the commit null.

declare const __WORMLIGHT_RELEASE__: string | undefined;
declare const __WORMLIGHT_COMMIT__: string | null | undefined;

export const RELEASE: string = typeof __WORMLIGHT_RELEASE__ === 'string' ? __WORMLIGHT_RELEASE__ : 'unknown';
export const COMMIT: string | null = typeof __WORMLIGHT_COMMIT__ === 'string' ? __WORMLIGHT_COMMIT__ : null;
