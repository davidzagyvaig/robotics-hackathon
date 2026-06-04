/** @type {import('next').NextConfig} */
const API = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  // Proxy API + mesh + macro to the FastAPI backend in dev so the dashboard
  // works with one origin and no CORS friction.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API}/api/:path*` },
      { source: "/backend-mesh.glb", destination: `${API}/mesh.glb` },
      { source: "/macro/:path*", destination: `${API}/macro/:path*` },
    ];
  },
};

export default nextConfig;
