import { Suspense } from "react";
import HomeClient from "./components/HomeClient";

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#d4cfc3]">
          <div className="animate-pulse text-gray-900">Loading...</div>
        </div>
      }
    >
      <HomeClient />
    </Suspense>
  );
}
