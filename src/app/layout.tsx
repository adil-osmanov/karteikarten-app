import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#F5F5F7",
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
    <html lang="de">
      <body className="min-h-screen bg-[#F5F5F7] text-gray-900 font-sans antialiased selection:bg-[#007AFF]/20">
        {children}
      </body>
    </html>
  );
}
