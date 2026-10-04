import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CargoFlow — цифровые международные грузоперевозки", template: "%s · CargoFlow" },
  description: "Единая платформа: грузы, ставки, договоры, водители, трекинг и документы международных перевозок.",
  applicationName: "CargoFlow",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#161618" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
