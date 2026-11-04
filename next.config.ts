import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Old addresses from the first, phone-only version of the app.
  async redirects() {
    return [
      { source: "/board", destination: "/deliverables", permanent: false },
      { source: "/pulse", destination: "/reports", permanent: false },
      { source: "/schedule", destination: "/calendar", permanent: false },
      { source: "/profile", destination: "/settings", permanent: false },
      { source: "/d/:id", destination: "/deliverables/:id", permanent: false },
    ];
  },
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
