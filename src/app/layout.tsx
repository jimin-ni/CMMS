import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "CMMS",
  description: "Creator Message Managing System",
};

// Google 태그(GTM 컨테이너). 루트 레이아웃에 두어 모든 페이지에 한 번만 들어갑니다.
const GTM_ID = "GTM-K8CFR6CF";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <Script
          id="google-tag"
          src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-tag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`}
        </Script>
      </head>
      <body className="flex min-h-full flex-col">
        <Header />
        {children}
      </body>
    </html>
  );
}
