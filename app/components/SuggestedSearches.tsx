"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SUGGESTED_SEARCHES = [
  "live streaming",
  "video codecs",
  "adaptive bitrate",
  "HDR workflow",
];

export default function SuggestedSearches() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSuggestionClick = (term: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("q", term);
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="mt-6 text-center">
      <p className="text-sm text-gray-600 mb-3">Try searching for:</p>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTED_SEARCHES.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => handleSuggestionClick(term)}
            className="px-4 py-2 bg-white border-2 border-black text-black font-medium hover:bg-black hover:text-white transition-colors cursor-pointer shadow-[2px_2px_0px_0px_#000] hover:shadow-[4px_4px_0px_0px_#000] hover:translate-x-[-2px] hover:translate-y-[-2px]"
          >
            {term}
          </button>
        ))}
      </div>
    </div>
  );
}
