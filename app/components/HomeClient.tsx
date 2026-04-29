"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchVideoById } from "../actions/get-video";
import type { VideoSearchResult } from "../db/videos";
import Footer from "./Footer";
import Header from "./Header";
import SearchInput from "./SearchInput";
import SearchResultsGrid from "./SearchResultsGrid";
import SuggestedSearches from "./SuggestedSearches";
import VideoModal from "./VideoModal";

export default function HomeClient() {
  const searchParams = useSearchParams();
  const [searchResults, setSearchResults] = useState<VideoSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [clipsRemaining, setClipsRemaining] = useState(0);
  const [directVideo, setDirectVideo] = useState<VideoSearchResult | null>(
    null,
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const previousQueryRef = useRef<string>("");
  const isInitialLoadRef = useRef(true);

  const query = searchParams.get("q") || "";
  const selectedVideoId = searchParams.get("video");
  const timeParam = searchParams.get("time");
  const directStartTime = timeParam ? Number.parseFloat(timeParam) : null;

  // Load video directly from URL if video param exists without query and not in search results
  useEffect(() => {
    if (selectedVideoId && !query) {
      const videoInResults = searchResults.find(
        (result) => result.video.id === selectedVideoId,
      );

      if (videoInResults) {
        setDirectVideo(null);
      } else {
        fetchVideoById(selectedVideoId)
          .then((video) => {
            if (video) {
              setDirectVideo(video);
            } else {
              console.error(
                `[Direct Video] Video not found: ${selectedVideoId}`,
              );
            }
          })
          .catch((error) => {
            console.error(`[Direct Video] Error loading video:`, error);
          });
      }
    } else {
      setDirectVideo(null);
    }
  }, [selectedVideoId, query, searchResults]);

  // Start search when query changes (but not on initial load with q param)
  useEffect(() => {
    const performSearch = async () => {
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        previousQueryRef.current = query;
        return;
      }

      if (previousQueryRef.current === query) {
        return;
      }
      previousQueryRef.current = query;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (!query.trim()) {
        if (!selectedVideoId) {
          setSearchResults([]);
          setHasSearched(false);
        }
        return;
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsLoading(true);
      setHasSearched(true);
      setSearchResults([]);
      setClipsRemaining(0);

      try {
        const response = await fetch(
          `/api/search?${new URLSearchParams({ q: query })}`,
          { signal: abortController.signal },
        );

        if (abortController.signal.aborted) return;

        if (!response.ok || !response.body) {
          setSearchResults([]);
          setIsLoading(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const message = JSON.parse(line);

              if (message.type === "videos") {
                const { videos, status } = message;
                if (videos && videos.length > 0) {
                  setSearchResults(videos);
                  setClipsRemaining(videos.length);
                }
                if (
                  status === "completed" &&
                  (!videos || videos.length === 0)
                ) {
                  setIsLoading(false);
                }
              } else if (message.type === "clips") {
                const { videoId, clips } = message;
                setSearchResults((prev) =>
                  prev.map((result) =>
                    result.video.id === videoId ? { ...result, clips } : result,
                  ),
                );
                setClipsRemaining((prev) => {
                  const remaining = prev - 1;
                  if (remaining <= 0) setIsLoading(false);
                  return remaining;
                });
              } else if (message.type === "error") {
                const { videoId } = message;
                console.error(
                  `[Search] Error for video ${videoId}:`,
                  message.message,
                );
                if (videoId) {
                  setSearchResults((prev) =>
                    prev.map((result) =>
                      result.video.id === videoId
                        ? { ...result, clips: [] }
                        : result,
                    ),
                  );
                  setClipsRemaining((prev) => {
                    const remaining = prev - 1;
                    if (remaining <= 0) setIsLoading(false);
                    return remaining;
                  });
                }
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }

        setIsLoading(false);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("[Search] Request error:", error);
          setSearchResults([]);
          setIsLoading(false);
        }
      }
    };

    performSearch();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [query, selectedVideoId]);

  // Find selected video
  let selectedVideo: VideoSearchResult | null = null;

  if (selectedVideoId) {
    selectedVideo =
      searchResults.find((result) => result.video.id === selectedVideoId) ||
      directVideo ||
      null;
  }

  const hasResults = searchResults.length > 0;
  const showResultsGrid = hasSearched && hasResults;

  return (
    <div className="min-h-screen flex flex-col bg-[#d4cfc3]">
      {showResultsGrid ? (
        <>
          <div className="w-full px-8 pt-8 sm:pt-12">
            <div className="max-w-2xl mx-auto">
              <Header />
              <SearchInput initialQuery={query} />
            </div>

            {/* Loading indicator for waterfall UX (shown while clips load) */}
            {isLoading && (
              <div className="max-w-lg mx-auto mt-4 flex items-center justify-center gap-3 bg-white px-4 py-3 border-2 border-black shadow-[4px_4px_0px_0px_#000]">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                <div className="text-sm font-medium text-black">
                  {clipsRemaining > 0
                    ? `Extracting clips (${clipsRemaining} remaining)...`
                    : "Finding relevant clips..."}
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
                <div className="inline-flex items-center gap-4 bg-white px-6 py-4 border-2 border-black shadow-[6px_6px_0px_0px_#000]">
                  <div className="w-6 h-6 border-3 border-gray-300 border-t-black rounded-full animate-spin" />
                  <div className="text-left">
                    <div className="font-semibold text-black">
                      {clipsRemaining > 0
                        ? "Extracting clips..."
                        : "Searching videos..."}
                    </div>
                    <div className="text-sm text-gray-600">
                      {clipsRemaining > 0
                        ? `${clipsRemaining} videos remaining`
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

            {/* Suggested Searches - only show when no query and no search performed */}
            {!query && !hasSearched && !isLoading && <SuggestedSearches />}
          </div>
        </div>
      )}

      <Footer />

      {selectedVideo && (
        <VideoModal
          isOpen={true}
          playbackId={selectedVideo.video.playback_id}
          startTime={directStartTime ?? 0}
          title={selectedVideo.video.title}
          chapters={selectedVideo.video.chapters}
          clips={selectedVideo.clips}
          videoId={selectedVideo.video.id}
        />
      )}
    </div>
  );
}
