import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#000000",
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
    <html lang="de" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches) || !theme) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.backgroundColor = '#000000';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.style.backgroundColor = '#ffffff';
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
