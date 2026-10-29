import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Fichier `.env` commun à la racine du dépôt (développement local) ; l'environnement reste prioritaire.
const rootEnv = resolve(__dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Photo et message vocal des questions d'aide passent par une action serveur.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Le service worker est toujours revérifié : une nouvelle version s'installe sans attendre.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
