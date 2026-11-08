import type { NextConfig } from "next";

const internalApiUrl = process.env.IDMS_API_INTERNAL_URL ?? "http://api:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Public users only reach the frontend URL. Browser API requests stay
  // same-origin and Next forwards them over the private Docker network.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiUrl}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;
