import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const project = dirname(fileURLToPath(import.meta.url));

function deploymentPackage(): Plugin {
  return {
    name: "leadpilot-deployment-package",
    closeBundle() {
      const dist = resolve(project, "dist");
      cpSync(resolve(project, "api"), resolve(dist, "api"), { recursive: true });
      cpSync(resolve(project, "composer.json"), resolve(dist, "composer.json"));
      if (existsSync(resolve(project, "composer.lock"))) {
        cpSync(resolve(project, "composer.lock"), resolve(dist, "composer.lock"));
      }
      if (existsSync(resolve(project, "vendor"))) {
        cpSync(resolve(project, "vendor"), resolve(dist, "vendor"), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), deploymentPackage()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
