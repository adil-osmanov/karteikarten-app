import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#FBFBFD",
};

export const metadata: Metadata = {
  title: "Kontext",
  description: "Learn German effortlessly.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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

      <body className="min-h-screen bg-[#FAFAFA] dark:bg-[#000000] text-gray-900 dark:text-[#F5F5F7] font-sans antialiased selection:bg-blue-600/20 dark:selection:bg-blue-500/30 transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
