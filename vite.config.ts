/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // GitHub Pages 프로젝트 경로 (woosukqw12.github.io/shortcut/)
  base: "/shortcut/",
  plugins: [react(), tailwindcss()],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
