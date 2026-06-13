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
