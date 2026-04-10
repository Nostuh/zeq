import path from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { splitVendorChunkPlugin } from "vite";

export default defineConfig({
  mode: "development",
  plugins: [vue(), splitVendorChunkPlugin()],
  resolve: {
    alias: {
      "~bootstrap": path.resolve(__dirname, "../node_modules/bootstrap"),
    },
  },
  server: {
    strictPort: true,
    hmr: {
      clientPort: 8081,
    },
    port: 8081,
    hot: true,
    fs: {
      // Allow serving files from one level up to the project root
      allow: [".."],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:50000',
        changeOrigin: true,
        secure: false,      
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  },
});
