import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistSerif } from "geist/font/serif";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liquid glass, on the web",
  description:
    "Tune a liquid glass material on a live card, then copy a prompt that builds it in your own project.",
};

export const viewport: Viewport = {
  themeColor: "#fbfbfa",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${GeistSerif.variable} antialiased`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
