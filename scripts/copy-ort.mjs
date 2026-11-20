// Copies the ONNX Runtime WebAssembly files used by on-device Whisper into public/ort/,
// so they are served from our own origin instead of a third-party CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const out = join(root, 'public', 'ort');
mkdirSync(out, { recursive: true });
for (const f of [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
]) {
  copyFileSync(join(src, f), join(out, f));
}
