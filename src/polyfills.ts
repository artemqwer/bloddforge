// Globals GramJS expects from a browser. Must run before `telegram` is imported.
import { Buffer } from 'buffer';
import { getRandomValues } from 'expo-crypto';

const g = globalThis as any;

g.Buffer ??= Buffer;
g.process ??= { env: {} };
g.process.env ??= {};
g.crypto ??= {};
g.crypto.getRandomValues ??= getRandomValues;

// RN defines `window`, so GramJS treats us as a browser and reads these.
g.window ??= g;
g.window.location ??= { protocol: 'https:', hostname: 'localhost' };
g.window.addEventListener ??= () => {};
g.window.removeEventListener ??= () => {};
