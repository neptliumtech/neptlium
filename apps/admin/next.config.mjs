if (process.env.VERCEL_ENV === 'preview' && (
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') !== 'https://ntbaoylcrwkowqqvzkno.supabase.co' ||
  !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')
)) {
  throw new Error('Vercel Preview requires the Dev Supabase browser configuration');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@neptlium/lib",
    "@neptlium/ui",
    "@neptlium/types",
    "@neptlium/design-system"
  ],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3002", "app.neptlium.com", "*.app.github.dev"]
    }
  }
};

export default nextConfig;
