/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PGlite (local Postgres in WASM) must not be bundled — load it as an external
  // package in the Node server runtime so its .wasm resolves correctly.
  experimental: {
    serverComponentsExternalPackages: ["@electric-sql/pglite"],
  },
};

export default nextConfig;
