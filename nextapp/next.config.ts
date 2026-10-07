import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Static export — committed to public/v2 and served by the existing Express
     server, exactly like the vite bundle in public/react. Zero server runtime
     changes: the deploy pipeline stays git-push + cron pull + pm2 restart. */
  output: "export",
  assetPrefix: "/v2",
  images: { unoptimized: true },
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
