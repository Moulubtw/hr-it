import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages: no server, the interview runs in the
 * browser with each visitor's own Gemini key.
 * NEXT_PUBLIC_BASE_PATH is set by the Pages workflow (e.g. "/hr-it").
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // With output: "export" this is the export folder; default is `out`.
  // e2e builds into its own folder so it never clobbers yours.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
