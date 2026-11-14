import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The inbox reply box and the CSV import send files through Server Actions (pictures up to 5 MB).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  partialPrefetching: true,
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
