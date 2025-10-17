"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import SearchResultCard from "./SearchResultCard";

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

interface SearchResultsGridProps {
  results: VideoResult[];
}

export default function SearchResultsGrid({ results }: SearchResultsGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (results.length > 0 && gridRef.current) {
      const cards = gridRef.current.querySelectorAll(".search-result-card");

      // Reset initial state
      cards.forEach((card) => {
        (card as HTMLElement).style.opacity = "0";
        (card as HTMLElement).style.transform =
          "scale(0) rotate(-10deg) translateY(50px)";
      });

      // Animate cards with stagger
      animate(cards, {
        opacity: [0, 1],
        scale: [0, 1.1, 1],
        rotate: ["-10deg", "2deg", "0deg"],
        translateY: [50, -10, 0],
        delay: stagger(80, {
          from: "first",
        }),
        duration: 500,
        easing: "easeOutBack",
      });
    }
  }, [results.length]);

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 px-8 pb-12">
      <div ref={gridRef} className="max-w-6xl mx-auto space-y-4">
        {results.map((result) => (
          <SearchResultCard key={result.video.id} result={result} />
        ))}
      </div>
    </div>
  );
}
