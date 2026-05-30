import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RiftSignal AI",
  description: "Agent-first vendor risk intelligence from live public web data."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
