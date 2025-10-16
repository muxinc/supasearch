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
    <div className="w-full relative bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000] focus-within:shadow-[6px_6px_0px_0px_#000] transition-shadow">
      <div className="flex items-center">
        <div className="p-2 sm:p-3">
          <Search
            className="w-5 h-5 sm:w-6 sm:h-6 text-black"
            strokeWidth={2}
          />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder=""
          className="flex-1 text-base sm:text-lg text-black bg-transparent border-none outline-none py-2 sm:py-3 pr-3"
          autoFocus
        />
      </div>
    </div>
  );
}
