"use client";

import MuxPlayer from "@mux/mux-player-react";
import type { MuxPlayerRefAttributes } from "@mux/mux-player-react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface VideoChapter {
  start: string; // Format: "HH:MM:SS"
  title: string;
}

interface ClipResult {
  start_time_seconds: number;
  end_time_seconds: number;
  snippet: string;
  relevance: "exact" | "related";
}

interface VideoModalProps {
  isOpen: boolean;
  playbackId: string;
  startTime: number;
  title: string;
  chapters?: VideoChapter[];
  clips?: ClipResult[];
  videoId?: string;
}

// Helper function to convert "HH:MM:SS" to seconds
function timeStringToSeconds(timeString: string): number {
  const parts = timeString.split(":").map(Number);
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  return 0;
}

// Helper function to format seconds to MM:SS or H:MM:SS
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function VideoModal({
  isOpen,
  playbackId,
  startTime,
  title,
  chapters,
  clips,
  videoId,
}: VideoModalProps) {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<MuxPlayerRefAttributes>(null);

  const handleClose = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("video");
    url.searchParams.delete("clip");
    url.searchParams.delete("time");
    router.replace(
      url.pathname +
        (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""),
      { scroll: false }
    );
  };

  const handleClipClick = (clip: ClipResult) => {
    // Seek the player to the clip start time
    if (playerRef.current) {
      playerRef.current.currentTime = clip.start_time_seconds;
    }

    // Update URL with the new time
    if (videoId) {
      const url = new URL(window.location.href);
      url.searchParams.set("video", videoId);
      url.searchParams.set("time", clip.start_time_seconds.toString());
      router.replace(url.pathname + `?${url.searchParams.toString()}`, { scroll: false });
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white border-2 border-black shadow-[8px_8px_0px_0px_#000] max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b-2 border-black">
          <h2 className="text-lg font-semibold text-black truncate pr-4">
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-2 bg-white border-2 border-black hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={20} className="text-black" />
          </button>
        </div>

        {/* Video and Clips Container */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Video Player */}
          <div className="flex-1 bg-black lg:min-w-0">
            <div className="aspect-video w-full h-full">
              <MuxPlayer
                ref={playerRef}
                playbackId={playbackId}
                startTime={startTime}
                style={{ width: "100%", height: "100%" }}
                onLoadedMetadata={(e) => {
                  if (chapters && chapters.length > 0) {
                    const playerElement = e.target as MuxPlayerRefAttributes;
                    const muxChapters = chapters.map((chapter) => ({
                      startTime: timeStringToSeconds(chapter.start),
                      value: chapter.title,
                    }));
                    playerElement.addChapters(muxChapters);
                  }
                }}
              />
            </div>
          </div>

          {/* Clips Section */}
          {clips && clips.length > 0 && (
            <div className="w-full lg:w-80 xl:w-96 flex flex-col bg-white border-t-2 lg:border-t-0 lg:border-l-2 border-black min-h-0">
              <h3 className="text-sm font-semibold text-black px-4 pt-4 pb-2 uppercase tracking-wide flex-shrink-0">
                Relevant Clips ({clips.length})
              </h3>
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 min-h-0">
              {clips.map((clip, idx) => {
                const thumbnailUrl = `https://image.mux.com/${playbackId}/thumbnail.png?width=160&time=${clip.start_time_seconds}`;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleClipClick(clip)}
                    className="w-full text-left bg-white border-2 border-black hover:bg-gray-100 transition-colors overflow-hidden flex gap-3 p-2"
                  >
                    <div className="w-24 h-16 flex-shrink-0 bg-gray-200 border-2 border-black">
                      <img
                        src={thumbnailUrl}
                        alt={`Clip ${idx + 1} thumbnail`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-black">
                          Clip {idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-black bg-gray-200 px-2 py-0.5 whitespace-nowrap">
                          {formatTime(clip.start_time_seconds)} – {formatTime(clip.end_time_seconds)}
                        </span>
                      </div>
                      <p className="text-xs text-black/90">
                        {clip.snippet}
                      </p>
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
