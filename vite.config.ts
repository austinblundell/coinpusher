import { defineConfig } from "vite";

export default defineConfig({
  // Served from https://austinblundell.github.io/coinpusher/, so assets resolve under that subpath.
  base: "/coinpusher/",
  server: { open: true },
  // Rapier's compat build ships inlined wasm, so no special wasm handling is needed.
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat"],
  },
});
