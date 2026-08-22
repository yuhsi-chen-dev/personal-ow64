import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Open Window 64",
  description: "把一個核心目標拆成 8 個次目標、64 個具體行為，然後真的把它們做完。",
};

/**
 * 在第一次繪製前就把主題套上去，否則深色模式的使用者會先看到一閃的白畫面。
 * 這段必須是同步的 inline script，不能搬進 React 元件。
 */
const noFlash = `try{var t=localStorage.getItem("ow64-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      {/* body 是 flex column，子層的 main 要記得 w-full，否則會縮成內容寬度 */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
