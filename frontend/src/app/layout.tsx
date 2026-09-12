import type { Metadata } from "next";
import "./globals.css";
import TimeGreeting from "@/components/time-greeting";
import { StoreProvider } from "@/lib/store/store-provider";

export const metadata: Metadata = {
  title: "Mallu Mart | Inventory & Revenue",
  description: "A calm command centre for your store inventory and revenue.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <TimeGreeting />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
