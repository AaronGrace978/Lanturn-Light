import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "web",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    fs: { allow: [rootDir] },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
  },
});
