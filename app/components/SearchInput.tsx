"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface SearchInputProps {
  initialQuery: string;
}

export default function SearchInput({ initialQuery }: SearchInputProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    const params = new URLSearchParams(searchParams);

    if (searchQuery.trim()) {
      params.set("q", searchQuery);
    } else {
      params.delete("q");
    }

    const newUrl = params.toString() ? `/?${params.toString()}` : "/";
    router.push(newUrl);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.metaKey)) {
      // Submit on Enter or Cmd+Enter or Ctrl+Enter
      handleSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
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
            onKeyDown={handleKeyDown}
            placeholder="Search videos..."
            className="flex-1 text-base sm:text-lg text-black bg-transparent border-none outline-none py-2 sm:py-3 pr-3"
          />
          <button
            type="submit"
            className="px-4 sm:px-6 py-2 sm:py-3 bg-black text-white font-semibold hover:bg-gray-800 transition-colors leading-[1.75] cursor-pointer"
          >
            Search
          </button>
        </div>
      </div>
    </form>
  );
}
