import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FRIDAY AI",
  description: "Your personal intelligence and agentic workspace.",
  applicationName: "FRIDAY AI"
};

export const viewport: Viewport = {
  themeColor: "#050b12",
  colorScheme: "dark"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
