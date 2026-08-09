import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Procedural Kitchen & Room Designer",
  description:
    "Draw walls and kitchen cabinet baselines, then explore the result in real-time 3D.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen w-screen overflow-hidden">{children}</body>
    </html>
  );
}
