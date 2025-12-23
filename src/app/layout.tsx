import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import type { Metadata } from "next";
import { ColorSchemeScript } from "@mantine/core";
import { IBM_Plex_Sans_KR, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "weet ERP",
  description: "업무 허브와 견적 산출을 통합한 ERP",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "weet ERP",
  },
  formatDetection: {
    telephone: false,
  },
};

const bodyFont = IBM_Plex_Sans_KR({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Space_Grotesk({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-display",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" data-mantine-color-scheme="light" suppressHydrationWarning>
      <head>
        <ColorSchemeScript forceColorScheme="light" />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

