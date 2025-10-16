"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface ClipResult {
  start_time_seconds: number;
  end_time_seconds: number;
  snippet: string;
}

interface VideoResult {
  video: {
    id: string;
    mux_asset_id: string;
    title: string;
    description: string;
    playback_id: string;
    topics: string[];
  };
  clips: ClipResult[];
}

interface SearchResultCardProps {
  result: VideoResult;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function SearchResultCard({ result }: SearchResultCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClipClick = (clipIndex: number) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.set("video", result.video.id);
    newSearchParams.set("clip", clipIndex.toString());
    router.push(`/?${newSearchParams.toString()}`);
  };

  const firstClip = result.clips[0];
  const thumbnail = `https://image.mux.com/${result.video.playback_id}/thumbnail.png?width=480&time=${firstClip?.start_time_seconds || 0}`;

  return (
    <div className="search-result-card bg-white dark:bg-gray-900 border-4 border-black dark:border-white shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#fff] hover:shadow-[12px_12px_0px_0px_#000] dark:hover:shadow-[12px_12px_0px_0px_#fff] transition-shadow overflow-hidden">
      {/* Video Header */}
      <div className="aspect-video bg-gray-200 dark:bg-gray-700 relative">
        <img
          src={thumbnail}
          alt={result.video.title}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-4 border-t-4 border-black dark:border-white">
        <h3 className="font-bold text-gray-900 dark:text-white line-clamp-2 mb-2 uppercase tracking-wider text-sm">
          {result.video.title}
        </h3>
        <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 font-medium mb-3">
          {result.video.description}
        </p>

        {/* Topics/Tags */}
        {result.video.topics && result.video.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {result.video.topics.slice(0, 3).map((topic, idx) => (
              <span
                key={idx}
                className="text-xs bg-black text-white dark:bg-white dark:text-black px-2 py-1 font-bold uppercase"
              >
                {topic}
              </span>
            ))}
          </div>
        )}

        {/* Clips */}
        <div className="border-t-2 border-black dark:border-white pt-3 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider mb-2">
            Relevant Clips ({result.clips.length})
          </div>
          {result.clips.map((clip, idx) => (
            <div
              key={idx}
              className="border-2 border-black dark:border-white p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              onClick={() => handleClipClick(idx)}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-gray-900 dark:text-white">
                  Clip {idx + 1}
                </span>
                <span className="text-xs bg-black text-white dark:bg-white dark:text-black px-2 py-0.5 font-bold">
                  {formatTime(clip.start_time_seconds)} -{" "}
                  {formatTime(clip.end_time_seconds)}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                {clip.snippet}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
