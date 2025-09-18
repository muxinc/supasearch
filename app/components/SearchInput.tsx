"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

interface SearchInputProps {
  initialQuery: string;
}

export default function SearchInput({ initialQuery }: SearchInputProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);

      if (searchQuery.trim()) {
        params.set("q", searchQuery);
      } else {
        params.delete("q");
      }

      const newUrl = params.toString() ? `/?${params.toString()}` : "/";
      router.push(newUrl);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, router, searchParams]);

  return (
    <div className="w-full relative bg-white dark:bg-gray-900 border-4 border-black dark:border-white shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#fff] focus-within:shadow-[12px_12px_0px_0px_#000] dark:focus-within:shadow-[12px_12px_0px_0px_#fff] transition-shadow">
      <div className="flex items-center">
        <div className="p-4">
          <Search
            className="w-16 h-16 sm:w-20 sm:h-20 text-black dark:text-white"
            strokeWidth={3}
          />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder=""
          className="flex-1 text-4xl sm:text-6xl lg:text-8xl font-bold text-black dark:text-white bg-transparent border-none outline-none p-4 uppercase font-[family-name:var(--font-bebas-neue)]"
          autoFocus
        />
      </div>
    </div>
  );
}
