import type { Metadata } from "next";
import "./styles.css";
import "./extraction.css";

export const metadata: Metadata = {
  title: "IDMS | Document composition workspace",
  description: "Compose, merge, and refine DOCX documents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
