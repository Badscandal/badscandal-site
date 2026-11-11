/* Stand-in for @netlify/blobs in handler tests: in-memory stores that honour onlyIfMatch / onlyIfNew
   (netlify/lib/staff-sample.mjs memoryDesk). globalThis.__stores lets a test look inside. */
import { memoryDesk } from "../../netlify/lib/staff-sample.mjs";
const all = (globalThis.__stores = globalThis.__stores || new Map());
globalThis.__asked = globalThis.__asked || [];
const store = (n) => { const name = typeof n === "string" ? n : n.name; globalThis.__asked.push(name); if (!all.has(name)) all.set(name, memoryDesk()); return all.get(name); };
export const getStore = store;
export const getDeployStore = store;
