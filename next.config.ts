import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole app is static files (decision 50): every page and every
  // navigation is served from the CDN edge, with no server function to wait
  // on. Data comes straight from Supabase in the browser, through RLS.
  // Redirects for old addresses live in netlify.toml.
  // (Cache Components / partial prerendering need a server, so they are off;
  // the app still renders in the browser behind a static skeleton.)
  output: "export",
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
