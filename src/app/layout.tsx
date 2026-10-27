import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CustomCursor } from '@/components/CustomCursor';

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const metadata: Metadata = {
  title: "Kontext",
  description: "Learn German effortlessly.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kontext",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const stored = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const isDark = stored ? stored === 'dark' : prefersDark;
                if (isDark) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.backgroundColor = '#000000';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.style.backgroundColor = '#ffffff';
                }
                let metaTheme = document.querySelector('meta[name="theme-color"]');
                if (metaTheme) metaTheme.setAttribute('content', isDark ? '#000000' : '#ffffff');
              } catch (_) {}
            `,
          }}
        />
      </head>

      <body className="min-h-screen bg-[#FAFAFA] dark:bg-[#000000] text-gray-900 dark:text-[#F5F5F7] font-sans antialiased selection:bg-blue-600/20 dark:selection:bg-blue-500/30 transition-colors duration-200">
        {children}
        <CustomCursor />
      </body>
    </html>
  );
}
