import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

const ICON_VERSION = "20261028-v2";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://kontext.app'),
  title: "Kontext",
  description: "Learn German effortlessly.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kontext",
  },
  icons: {
    icon: [
      { url: `/favicon.png?v=${ICON_VERSION}`, sizes: '32x32', type: 'image/png' },
      { url: `/icon-192.png?v=${ICON_VERSION}`, sizes: '192x192', type: 'image/png' },
      { url: `/icon-512.png?v=${ICON_VERSION}`, sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: `/apple-touch-icon.png?v=${ICON_VERSION}`, sizes: '180x180', type: 'image/png' },
    ],
    shortcut: [`/favicon.ico?v=${ICON_VERSION}`],
  },
  manifest: `/manifest.json?v=${ICON_VERSION}`,
  openGraph: {
    title: "Kontext",
    description: "Learn German effortlessly.",
    images: [{ url: `/logo.png?v=${ICON_VERSION}` }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href={`/favicon.png?v=${ICON_VERSION}`} />
        <link rel="icon" type="image/png" sizes="192x192" href={`/icon-192.png?v=${ICON_VERSION}`} />
        <link rel="icon" type="image/png" sizes="512x512" href={`/icon-512.png?v=${ICON_VERSION}`} />
        <link rel="apple-touch-icon" sizes="180x180" href={`/apple-touch-icon.png?v=${ICON_VERSION}`} />
        <link rel="shortcut icon" href={`/favicon.ico?v=${ICON_VERSION}`} />
        <link rel="manifest" href={`/manifest.json?v=${ICON_VERSION}`} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const stored = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const isDark = stored ? stored === 'dark' : prefersDark;
                if (isDark) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.backgroundColor = '#09090b';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.style.backgroundColor = '#fbfbfd';
                }
                let metaTheme = document.querySelector('meta[name="theme-color"]');
                if (metaTheme) metaTheme.setAttribute('content', isDark ? '#09090b' : '#fbfbfd');
              } catch (_) {}
            `,
          }}
        />
      </head>

      <body className="min-h-screen bg-[#fbfbfd] dark:bg-[#09090b] text-zinc-900 dark:text-[#F5F5F7] font-sans antialiased selection:bg-blue-600/20 dark:selection:bg-blue-500/30 transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
