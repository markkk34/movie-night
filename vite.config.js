import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the build work under https://USER.github.io/REPO/ without changes
export default defineConfig({ plugins: [react()], base: "./" });
