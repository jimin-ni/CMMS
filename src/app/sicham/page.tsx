import Link from "next/link";
import { Hub } from "@/components/sicham/hub";

// 목업 단계라 로그인 게이트 없이 열어 둡니다.
// 실제 연동 시 다른 페이지처럼 auth.api.getSession 으로 보호합니다.
export default function SichamPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <Link
        href="/features"
        className="mb-6 inline-block rounded-full bg-white px-5 py-2 text-sm text-key-brown shadow-sm"
      >
        주요 기능으로 돌아가기
      </Link>
      <Hub />
    </main>
  );
}
