# Deferred Items

Pre-existing issues discovered during execution that are out of scope for the plan that found them.

## PixiAdapter.ts 'obj' possibly undefined errors

- **Found during:** 01-03 (tsc check after removing rootDir)
- **File:** `libs/engine/core/src/renderer/PixiAdapter.ts` (lines 246, 247, 253, 254)
- **Error:** `TS18048: 'obj' is possibly 'undefined'`
- **Status:** Pre-existing in PixiAdapter.ts before 01-03 started; PixiAdapter is not part of plan 01-03 scope
- **Deferred to:** Whatever plan implements the renderer (01-04 or similar)
