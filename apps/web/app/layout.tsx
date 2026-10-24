import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mold Busters, Preliminary Mold Screening", template: "%s · Mold Busters" },
  description: "Upload a short video or photos and get an AI-assisted preliminary moisture and mold screening. Not a certified inspection.",
  robots: { index: false }, // prototype
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#17383b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body suppressHydrationWarning>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
