import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "RecursApp — Recurre tu multa con IA",
  description: "Genera recursos de multas profesionales con inteligencia artificial. Tres agentes LLM trabajan en conjunto para elaborar el mejor recurso posible.",
  keywords: "recurso multa, recurrir multa, inteligencia artificial, defensa multa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1a1a24',
              color: '#f9f6ef',
              border: '1px solid #2a2a38',
              fontFamily: 'Crimson Text, serif',
              fontSize: '16px',
            },
            success: {
              iconTheme: { primary: '#c9a84c', secondary: '#0a0a0f' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#0a0a0f' },
            },
          }}
        />
      </body>
    </html>
  );
}
