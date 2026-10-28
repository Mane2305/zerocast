import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import "./globals.css";
import "./studio.css";
import "./accuracy.css";
import "./remaining.css";
export const metadata: Metadata = {
  title: "ZeroCast | Forecast workspace",
  description: "Honest zero-shot forecasting for retail and manufacturing.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
