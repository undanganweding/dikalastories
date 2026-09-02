//
// Vercel serverless entry.
//
// The project is ESM ("type": "module"), and Vercel compiles api/*.ts per-file
// WITHOUT bundling relative imports. Extensionless ESM imports
// ('../server/app') then fail at runtime with ERR_MODULE_NOT_FOUND.
//
// Fix: `npm run build` bundles this whole entry (server/app + routes + engines)
// into dist/api-bundle.cjs (CJS, node_modules kept external), and vercel.json
// ships that file via functions.includeFiles. Here we simply load it.
//
// CJS-compatible load (no top-level await): esbuild bundles this entry to CJS.
// `require` of the sibling bundle is resolved at runtime inside the function.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod: any = require('../dist/api-bundle.cjs');

const createApp = mod.createApp ?? mod.default?.createApp ?? mod;
const app = createApp();

export default app;

