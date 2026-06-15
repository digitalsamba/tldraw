import { createContext } from 'react'

/**
 * Opt-in flag for the Firefox editing-caret scale fix (see `useFirefoxEditingScale`).
 *
 * Defaults to `false`, so the fix is fully disabled unless a consumer explicitly
 * passes `enableFirefoxEditingScale` to `<Tldraw />`. This keeps the behavior off
 * for embeddings that don't need it (e.g. a whiteboard rendered at zoom = 1).
 */
export const FirefoxEditingScaleContext = createContext<boolean>(false)
