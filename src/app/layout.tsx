import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#FBFBFD",
};

export const metadata: Metadata = {
  title: "Karten - Smart Mastery",
  description: "Learn German effortlessly.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Karten",
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
                if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
              } catch (_) {}
            `,
          }}
        />
      </head>

      <body className="min-h-screen bg-[#FAFAFA] dark:bg-[#000000] text-gray-900 dark:text-[#F5F5F7] font-sans antialiased selection:bg-[#007AFF]/20 transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
