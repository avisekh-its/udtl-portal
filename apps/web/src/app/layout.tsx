import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UDTL Customer Portal",
  description: "United Dhillon Trucking Lines — Customer Portal & Operations Console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
