import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { SplashScreen } from "@/components/splash-screen";

export const metadata: Metadata = {
  title: "UDTL Customer Portal",
  description: "United Dhillon Trucking Lines — Customer Portal & Operations Console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <SplashScreen />
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{ duration: 3500, style: { fontSize: "13px" } }}
        />
      </body>
    </html>
  );
}
