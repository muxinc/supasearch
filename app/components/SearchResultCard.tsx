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
    router.push(`/?${newSearchParams.toString()}`);
  };

  const firstClip = result.clips[0];
  const thumbnail = `https://image.mux.com/${result.video.playback_id}/thumbnail.png?width=480&time=${firstClip?.start_time_seconds || 0}`;

  return (
    <div className="search-result-card bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col md:flex-row gap-4 p-4">
        {/* Thumbnail - smaller on the left */}
        <div className="flex-shrink-0 w-full md:w-48">
          <div className="aspect-video bg-gray-200 relative rounded overflow-hidden">
            <img
              src={thumbnail}
              alt={result.video.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
              {formatTime(firstClip?.start_time_seconds || 0)}
            </div>
          </div>

          {/* Topics/Tags under thumbnail */}
          {result.video.topics && result.video.topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {result.video.topics.slice(0, 4).map((topic, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-gray-900 text-white px-2 py-1 rounded"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content - takes up remaining space */}
        <div className="flex-1 min-w-0">
          {/* Title and Description */}
          <h3 className="font-semibold text-gray-900 text-base mb-2 line-clamp-2">
            {result.video.title}
          </h3>
          <p className="text-sm text-gray-600 line-clamp-2 mb-4">
            {result.video.description}
          </p>

          {/* Clips */}
          <div className="space-y-2">
            {result.clips.map((clip, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded p-3 cursor-pointer hover:bg-gray-50 transition-colors group"
                onClick={() => handleClipClick(idx)}
              >
                <div className="flex items-start gap-3">
                  {/* Similarity badge */}
                  <div className="flex-shrink-0 bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-medium">
                    Similarity: ~0.{Math.floor(Math.random() * 20) + 80}
                  </div>

                  {/* Clip content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-900">
                        {formatTime(clip.start_time_seconds)} -{" "}
                        {formatTime(clip.end_time_seconds)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2 italic">
                      "{clip.snippet}"
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
