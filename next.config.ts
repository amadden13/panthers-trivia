import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/panthers",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
