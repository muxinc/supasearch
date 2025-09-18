"use client";

import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import SearchResultCard from "./SearchResultCard";

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
}

interface SearchResultsGridProps {
  results: MediaItem[];
}

export default function SearchResultsGrid({ results }: SearchResultsGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (results.length > 0 && gridRef.current) {
      const cards = gridRef.current.querySelectorAll('.search-result-card');
      
      // Reset initial state
      cards.forEach(card => {
        (card as HTMLElement).style.opacity = '0';
        (card as HTMLElement).style.transform = 'scale(0) rotate(-10deg) translateY(50px)';
      });

      // Animate cards with stagger
      animate(cards, {
        opacity: [0, 1],
        scale: [0, 1.1, 1],
        rotate: ['-10deg', '2deg', '0deg'],
        translateY: [50, -10, 0],
        delay: stagger(80, {
          from: 'first'
        }),
        duration: 500,
        easing: 'easeOutBack'
      });
    }
  }, [results.length]);

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="mt-12 px-8">
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {results.map((item) => (
          <SearchResultCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}