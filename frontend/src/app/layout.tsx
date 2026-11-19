import type { Metadata } from "next";
import {
  Wix_Madefor_Display,
  Radio_Canada_Big,
  Red_Hat_Mono,
} from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const wixDisplay = Wix_Madefor_Display({
  variable: "--font-wix-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const radioCanada = Radio_Canada_Big({
  variable: "--font-radio-canada",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const redHatMono = Red_Hat_Mono({
  variable: "--font-red-hat-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TSA Present — AI Presentation & Speech Coach",
  description:
    "Studio-grade vocal delivery, pacing, filler-word, and TSA rubric coaching powered by acoustic telemetry and AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${wixDisplay.variable} ${radioCanada.variable} ${redHatMono.variable}`}
    >
      <body className="min-h-screen bg-surface text-on-surface font-body antialiased selection:bg-primary/15 selection:text-primary">
        <div className="flex min-h-screen flex-col">
          <Navbar />
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
