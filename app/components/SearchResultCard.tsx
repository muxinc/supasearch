"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface ClipResult {
  start_time_seconds: number;
  end_time_seconds: number;
  snippet: string;
  relevance: "exact" | "related";
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
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function SearchResultCard({ result }: SearchResultCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClipClick = (clipIndex: number) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.set("video", result.video.id);
    newSearchParams.set("clip", clipIndex.toString());
    router.replace(`/?${newSearchParams.toString()}`, { scroll: false });
  };

  const handleVideoClick = () => {
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.set("video", result.video.id);
    newSearchParams.delete("clip"); // No clip = start from beginning
    router.replace(`/?${newSearchParams.toString()}`, { scroll: false });
  };

  const firstClip = result.clips[0];
  const thumbnailBase = `https://image.mux.com/${result.video.playback_id}/thumbnail.png`;
  const thumbnail = firstClip
    ? `${thumbnailBase}?width=720&time=${firstClip.start_time_seconds}`
    : `${thumbnailBase}?width=720`;

  return (
    <div className="search-result-card bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
      <button
        type="button"
        onClick={handleVideoClick}
        className="relative w-full cursor-pointer hover:opacity-95 transition-opacity"
      >
        <div className="aspect-video bg-gray-200">
          <img
            src={thumbnail}
            alt={result.video.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Topics/Tags */}
        {result.video.topics && result.video.topics.length > 0 && (
          <div className="absolute top-3 right-3 flex flex-wrap gap-1 justify-end">
            {result.video.topics.slice(0, 3).map((topic, idx) => (
              <span
                key={idx}
                className="text-[11px] uppercase tracking-wide bg-black/70 text-white px-2 py-1 rounded-full"
              >
                {topic}
              </span>
            ))}
          </div>
        )}

        {/* Overlay for title & description */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/70 to-transparent p-6 text-left">
          <h3 className="text-white text-xl font-semibold leading-tight mb-2 line-clamp-2">
            {result.video.title}
          </h3>
          <p className="text-white/90 text-sm leading-relaxed line-clamp-3">
            {result.video.description}
          </p>
        </div>

        {/* Primary clip time badge */}
        {firstClip && (
          <div className="absolute top-3 left-3 bg-white/85 text-gray-900 text-xs font-semibold px-3 py-1 rounded-full shadow">
            Starts at {formatTime(firstClip.start_time_seconds)}
          </div>
        )}
      </button>

      {/* Clip list */}
      <div className="px-5 pb-5 pt-4 space-y-3 bg-white">
        {result.clips.length > 0 ? (
          result.clips.map((clip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleClipClick(idx)}
              className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Clip {idx + 1}
                  </span>
                  {clip.relevance === "related" && (
                    <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                      Similar
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-1">
                  {formatTime(clip.start_time_seconds)} –{" "}
                  {formatTime(clip.end_time_seconds)}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-700 line-clamp-2">
                "{clip.snippet}"
              </p>
            </button>
          ))
        ) : (
          <div className="flex items-center gap-3 border border-dashed border-gray-300 rounded-xl px-4 py-4 text-sm text-gray-600 bg-gray-50">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin" />
            <span>Analyzing the video to surface relevant clips...</span>
          </div>
        )}
      </div>
    </div>
  );
}
