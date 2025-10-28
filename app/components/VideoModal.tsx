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

interface VideoModalProps {
  isOpen: boolean;
  playbackId: string;
  startTime: number;
  title: string;
  chapters?: VideoChapter[];
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

export default function VideoModal({
  isOpen,
  playbackId,
  startTime,
  title,
  chapters,
}: VideoModalProps) {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);

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
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-4">
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="aspect-video bg-black">
          <MuxPlayer
            playbackId={playbackId}
            startTime={startTime}
            controls
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
    </div>
  );
}
