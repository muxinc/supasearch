"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { VideoSearchResult } from "../db/videos";
import Footer from "./Footer";
import Header from "./Header";
import SearchInput from "./SearchInput";
import SearchResultsGrid from "./SearchResultsGrid";
import VideoModal from "./VideoModal";

export default function HomeClient() {
  const searchParams = useSearchParams();
  const [searchResults, setSearchResults] = useState<VideoSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{
    step: number;
    totalSteps: number;
    currentStep: string;
  } | null>(null);

  const query = searchParams.get("q") || "";
  const selectedVideoId = searchParams.get("video");
  const clipParam = searchParams.get("clip");
  const selectedClipIndex = clipParam ? Number.parseInt(clipParam, 10) : 0;

  // Perform search when query changes
  useEffect(() => {
    const performSearch = async () => {
      if (!query.trim()) {
        setSearchResults([]);
        setHasSearched(false);
        setSearchProgress(null);
        return;
      }

      setIsLoading(true);
      setHasSearched(true);
      setSearchProgress(null);

      try {
        // Start the search job
        const response = await fetch(
          `/api/search?${new URLSearchParams({ q: query })}`,
        );
        const data = await response.json();

        if (data.error) {
          console.error("Search error:", data.error);
          setSearchResults([]);
          setIsLoading(false);
          return;
        }

        const { jobId } = data;

        // Poll for results
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await fetch(
              `/api/search/status?${new URLSearchParams({ jobId })}`,
            );
            const statusData = await statusResponse.json();

            // Update progress if available
            if (statusData.progress) {
              setSearchProgress(statusData.progress);
            }

            // WATERFALL UX: Display partial results immediately as they arrive
            // This allows users to see video matches before clips are fully processed
            if (statusData.results && statusData.results.length > 0) {
              setSearchResults(statusData.results);
              // Keep loading state active until fully completed
              if (statusData.status === "completed") {
                setIsLoading(false);
              }
            }

            if (statusData.status === "completed") {
              clearInterval(pollInterval);
              setSearchResults(statusData.results || []);
              setIsLoading(false);
              setSearchProgress(null);
            } else if (statusData.status === "failed") {
              clearInterval(pollInterval);
              console.error("Search failed:", statusData.error);
              setSearchResults([]);
              setIsLoading(false);
              setSearchProgress(null);
            }
          } catch (error) {
            console.error("Status poll error:", error);
          }
        }, 500); // Poll every 500ms for faster updates

        // Cleanup on unmount or query change
        return () => clearInterval(pollInterval);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
        setIsLoading(false);
        setSearchProgress(null);
      }
    };

    const cleanup = performSearch();
    return () => {
      if (cleanup instanceof Promise) {
        cleanup.then((fn) => fn?.());
      }
    };
  }, [query]);

  // Find selected video and clip
  let selectedVideo: VideoSearchResult | null = null;
  let selectedClip: { startTime: number; endTime: number } | null = null;

  if (selectedVideoId) {
    selectedVideo =
      searchResults.find((result) => result.video.id === selectedVideoId) ||
      null;
    if (selectedVideo?.clips[selectedClipIndex]) {
      const clip = selectedVideo.clips[selectedClipIndex];
      selectedClip = {
        startTime: clip.start_time_seconds,
        endTime: clip.end_time_seconds,
      };
    }
  }

  const hasResults = searchResults.length > 0;
  const showResultsGrid = hasSearched && hasResults;

  return (
    <div className="min-h-screen flex flex-col bg-[#d4cfc3]">
      {showResultsGrid ? (
        <>
          <div className="w-full px-8 pt-8 sm:pt-12">
            <Header />
            <SearchInput initialQuery={query} />

            {/* Loading indicator for waterfall UX (shown while clips load) */}
            {isLoading && (
              <div className="mt-4 flex items-center justify-center gap-3 bg-white/80 px-4 py-3 rounded-lg">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                <div className="text-sm text-gray-900">
                  {searchProgress
                    ? searchProgress.currentStep
                    : "Refining clips..."}
                </div>
              </div>
            )}
          </div>
          <SearchResultsGrid results={searchResults} />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-full max-w-2xl">
            <Header />
            <SearchInput initialQuery={query} />

            {/* Loading State */}
            {isLoading && (
              <div className="mt-12 text-center">
                <div className="inline-flex items-center gap-3 bg-white px-6 py-4 rounded-lg shadow-md">
                  <div className="w-6 h-6 border-3 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">
                      {searchProgress
                        ? searchProgress.currentStep
                        : "Starting search..."}
                    </div>
                    <div className="text-sm text-gray-600">
                      {searchProgress
                        ? `Step ${searchProgress.step} of ${searchProgress.totalSteps}`
                        : "Analyzing content with AI"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* No Results State */}
            {hasSearched && !hasResults && !isLoading && query && (
              <div className="mt-12 text-center text-gray-600">
                <p className="text-lg">No results found for "{query}"</p>
                <p className="text-sm mt-2">Try a different search query</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Footer />

      {selectedVideo && selectedClip && (
        <VideoModal
          isOpen={true}
          playbackId={selectedVideo.video.playback_id}
          startTime={selectedClip.startTime}
          title={selectedVideo.video.title}
        />
      )}
    </div>
  );
}
