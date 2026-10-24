import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "영화 박스오피스 인사이트",
  description: "날짜별 박스오피스와 영화 흥행 추이를 살펴보는 대시보드",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <header>
          <Link href="/" className="brand">BOX OFFICE INSIGHTS</Link>
          <nav aria-label="주 메뉴">
            <Link href="/">박스오피스</Link>
            <Link href="/insights">인사이트</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>데이터 출처: 영화진흥위원회 KOBIS</footer>
      </body>
    </html>
  );
}
