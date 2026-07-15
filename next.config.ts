import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone output for Docker production builds.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1"
    ? ({ output: "standalone" } as const)
    : {}),
  // Version-skew protection. We redeploy on every push to main, so a review or
  // editor tab left open across a deploy would otherwise fire Server Actions at
  // a build that no longer recognizes them ("Failed to find Server Action").
  // Stamping the build with the deploying commit makes such a tab hard-navigate
  // to consistent assets instead of silently breaking. Paired with a pinned
  // NEXT_SERVER_ACTIONS_ENCRYPTION_KEY (injected at build time, see Dockerfile +
  // build-images.yml) so action payloads from a pre-deploy tab still decrypt.
  ...(process.env.NEXT_DEPLOYMENT_ID
    ? { deploymentId: process.env.NEXT_DEPLOYMENT_ID }
    : {}),
  serverExternalPackages: ["pg", "drizzle-orm"],
  experimental: {
    // proxy.ts buffers every request body in memory, capped here. The default
    // 10MB silently truncates larger uploads (e.g. camera photos), so raise it
    // to a bounded ceiling. Keep in sync with MAX_UPLOAD_BYTES in the uploads
    // route, which rejects anything over the limit with a clear error.
    proxyClientMaxBodySize: "25mb",
  },
  async rewrites() {
    const backend = process.env.EDITOR_BACKEND_URL ?? "http://127.0.0.1:8001";
    return [
      // NOTE: /api/compile, /api/compile-chip, and /api/compile-rom are NOT
      // rewritten here. They're served by route handlers under
      // src/app/api/compile*/ that require a session before proxying to the
      // backend (see src/lib/editor/backendProxy.ts) — compiling arbitrary
      // source is a build-server abuse/file-read surface, so signed-out
      // visitors can run a shared project's shipped hex but can't recompile.
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
      { protocol: "https", hostname: "onsilo.dev" },
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
