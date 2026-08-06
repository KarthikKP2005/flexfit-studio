import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "@/components/NavBar";

/**
 * Root layout: global styles, the tRPC/React Query provider tree, and
 * the persistent NavBar around every route. Not responsible for:
 * auth/role gating of individual pages — that happens per-page (see
 * each route's own client component).
 */
export const metadata: Metadata = {
  title: "FlexFit Studio",
  description: "Class booking and membership management for FlexFit Studio.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <NavBar />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
