import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [vue(), cloudflare()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/vue/") || id.includes("/@vue/")) return "vendor-vue";
          if (id.includes("vue-i18n")) return "vendor-i18n";
          if (id.includes("dexie")) return "vendor-db";
          if (id.includes("uplot")) return "vendor-charts";
          if (id.includes("@supabase/")) return "vendor-supabase";
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 7001,
    strictPort: false,
    hmr: true,
  },
});