import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = process.env.EDITOR_BACKEND_URL ?? "http://127.0.0.1:8001";
    return [
      {
        source: "/api/compile/:path*",
        destination: `${backend}/api/compile/:path*`,
      },
      {
        source: "/api/compile-chip",
        destination: `${backend}/api/compile-chip`,
      },
      { source: "/api/compile-rom", destination: `${backend}/api/compile-rom` },
      {
        source: "/api/libraries/:path*",
        destination: `${backend}/api/libraries/:path*`,
      },
      {
        source: "/api/simulation/:path*",
        destination: `${backend}/api/simulation/:path*`,
      },
      {
        source: "/api/gateway/:path*",
        destination: `${backend}/api/gateway/:path*`,
      },
      {
        source: "/api/flash/:path*",
        destination: `${backend}/api/flash/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.hackclub.com" },
      { protocol: "https", hostname: "assets.hackclub.com" },
    ],
  },
  reactCompiler: process.env.NODE_ENV === "production",
  turbopack: {
    root: __dirname,
    rules: {
      "*.c": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  webpack: (config, { dev }) => {
    config.module.rules.unshift({
      resourceQuery: /raw/,
      test: /\.(c|json)$/,
      type: "asset/source",
    });

    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/.archive/**",
          "**/temp/**",
          "**/.next/**",
          "**/node_modules/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
