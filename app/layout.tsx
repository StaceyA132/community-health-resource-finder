import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Community Health Resource Finder",
  description: "Find nearby free and low-cost health resources by zip code."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
