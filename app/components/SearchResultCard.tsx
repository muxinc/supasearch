"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface MediaItem {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnail: string;
  startTime: number;
  endTime: number;
  chunkText: string;
  similarity?: number;
  playbackId: string;
}

interface SearchResultCardProps {
  item: MediaItem;
}

export default function SearchResultCard({ item }: SearchResultCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClick = () => {
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.set("video", item.id);
    newSearchParams.set("time", item.startTime.toString());
    router.push(`/?${newSearchParams.toString()}`);
  };

  return (
    <div
      className="search-result-card bg-white dark:bg-gray-900 border-4 border-black dark:border-white shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#fff] hover:shadow-[12px_12px_0px_0px_#000] dark:hover:shadow-[12px_12px_0px_0px_#fff] transition-shadow overflow-hidden cursor-pointer"
      onClick={handleClick}
    >
      <div className="aspect-video bg-gray-200 dark:bg-gray-700 relative">
        <img
          src={item.thumbnail}
          alt={item.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 right-2 bg-black text-white text-xs px-2 py-1 border-2 border-white font-bold">
          {item.duration}
        </div>
      </div>
      <div className="p-4 border-t-4 border-black dark:border-white">
        <h3 className="font-bold text-gray-900 dark:text-white line-clamp-2 mb-3 uppercase tracking-wider text-sm">
          {item.title}
        </h3>
        <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3 font-medium mb-2">
          {item.description}
        </p>
        <div className="border-t border-gray-300 dark:border-gray-600 pt-2 mt-2">
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 italic">
            "{item.chunkText.substring(0, 150)}..."
          </p>
          {item.similarity !== undefined && (
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-green-600 dark:text-green-400 font-bold">
                Similarity: {item.similarity.toFixed(3)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
