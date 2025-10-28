"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { fetchRealtimeSubscriptionToken } from "../actions/get-subscribe-token";
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
  const [searchId, setSearchId] = useState<string | null>(null);
  const [subscriptionToken, setSubscriptionToken] = useState<any>(null);
  const [clipsRemaining, setClipsRemaining] = useState(0);
  const [directVideo, setDirectVideo] = useState<VideoSearchResult | null>(null);
  const searchIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const previousQueryRef = useRef<string>("");
  const isInitialLoadRef = useRef(true);

  const query = searchParams.get("q") || "";
  const selectedVideoId = searchParams.get("video");
  const timeParam = searchParams.get("time");
  const directStartTime = timeParam ? Number.parseFloat(timeParam) : null;

  // Token fetcher for realtime subscription
  const getToken = useCallback(async () => {
    if (!searchIdRef.current) {
      console.error("[Token Fetch] No active search ID");
      throw new Error("No active search ID");
    }

    try {
      const token = await fetchRealtimeSubscriptionToken(searchIdRef.current);
      return token;
    } catch (error) {
      console.error("[Token Fetch] Error:", error);
      throw error;
    }
  }, [searchId]);

  // Fetch token when searchId changes
  useEffect(() => {
    if (!searchId) {
      setSubscriptionToken(null);
      return;
    }

    // Clear previous subscription token to force re-subscription
    setSubscriptionToken(null);

    fetchRealtimeSubscriptionToken(searchId)
      .then((token) => {
        setSubscriptionToken(token);
      })
      .catch((error) => {
        console.error("[Token Setup] Failed to fetch token:", error);
      });
  }, [searchId]);

  // Subscribe to realtime updates
  const subscriptionConfig = {
    token: subscriptionToken,
    refreshToken: getToken,
    // Only subscribe when we have a token
    enabled: !!subscriptionToken,
  };


  const {
    data: realtimeMessages,
    error: subscriptionError,
    state: subscriptionState,
    freshData,
    latestData
  } = useInngestSubscription(subscriptionConfig);

  // Log subscription errors
  useEffect(() => {
    if (subscriptionError) {
      console.error("[Realtime] Subscription error:", subscriptionError);
    }
  }, [subscriptionError]);

  // Process realtime messages
  useEffect(() => {
    if (!realtimeMessages || realtimeMessages.length === 0) {
      return;
    }

    // Only process messages if we still have an active search
    if (!searchId) {
      return;
    }

    // Process each message
    for (let i = 0; i < realtimeMessages.length; i++) {
      const message = realtimeMessages[i];

      if (message.topic === "videos") {
        // Initial video results
        const { videos, status } = message.data as {
          videos: VideoSearchResult[];
          status: "initial" | "processing" | "completed";
        };

        if (videos && videos.length > 0) {
          setSearchResults(videos);
          setClipsRemaining(videos.length);
        }

        if (status === "completed" && (!videos || videos.length === 0)) {
          setIsLoading(false);
        }
      } else if (message.topic === "clips") {
        // Individual clip results
        const { videoId, clips } = message.data as {
          videoId: string;
          clips: Array<{
            start_time_seconds: number;
            end_time_seconds: number;
            snippet: string;
            relevance: "exact" | "related";
          }>;
        };

        // Update the specific video with clips
        setSearchResults((prev) =>
          prev.map((result) =>
            result.video.id === videoId
              ? { ...result, clips }
              : result
          )
        );

        // Decrement clips remaining
        setClipsRemaining((prev) => {
          const remaining = prev - 1;
          if (remaining <= 0) {
            setIsLoading(false);
          }
          return remaining;
        });
      } else if (message.topic === "error") {
        // Error for a specific video
        const { videoId, message: errorMessage } = message.data as {
          videoId?: string;
          message: string;
        };

        console.error(`[Clips] Error for video ${videoId}:`, errorMessage);

        // Mark video as having no clips
        if (videoId) {
          setSearchResults((prev) =>
            prev.map((result) =>
              result.video.id === videoId
                ? { ...result, clips: [] }
                : result
            )
          );

          setClipsRemaining((prev) => {
            const remaining = prev - 1;
            if (remaining <= 0) {
              setIsLoading(false);
            }
            return remaining;
          });
        }
      }
    }
  }, [realtimeMessages]);

  // Load video directly from URL if video param exists without query and not in search results
  useEffect(() => {
    if (selectedVideoId && !query) {
      // Check if video is already in search results
      const videoInResults = searchResults.find((result) => result.video.id === selectedVideoId);

      if (videoInResults) {
        setDirectVideo(null);
      } else {
        fetchVideoById(selectedVideoId)
          .then((video) => {
            if (video) {
              setDirectVideo(video);
            } else {
              console.error(`[Direct Video] Video not found: ${selectedVideoId}`);
            }
          })
          .catch((error) => {
            console.error(`[Direct Video] Error loading video:`, error);
          });
      }
    } else {
      // Clear direct video if query changes or video param removed
      setDirectVideo(null);
    }
  }, [selectedVideoId, query, searchResults]);

  // Start search when query changes (but not on initial load with q param)
  useEffect(() => {
    const performSearch = async () => {
      // Skip search on initial page load - only populate the search box
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        previousQueryRef.current = query;
        return;
      }

      // Skip if query hasn't actually changed
      if (previousQueryRef.current === query) {
        return;
      }
      previousQueryRef.current = query;

      // Cancel any previous search
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (!query.trim()) {
        // Only reset search state if we don't have a video selected
        // This preserves the search results grid when clicking a video
        if (!selectedVideoId) {
          setSearchResults([]);
          setHasSearched(false);
          setSearchId(null);
          searchIdRef.current = null;
          setSubscriptionToken(null);
        }
        return;
      }

      // Create a new AbortController for this search
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Generate a unique search ID BEFORE starting the job
      const newSearchId = crypto.randomUUID();

      // Set search ID immediately so subscription can start
      setSearchId(newSearchId);
      searchIdRef.current = newSearchId;

      setIsLoading(true);
      setHasSearched(true);
      setSearchResults([]);
      setClipsRemaining(0);

      try {
        // Start the search job with our pre-generated searchId
        const response = await fetch(
          `/api/search?${new URLSearchParams({ q: query, searchId: newSearchId })}`,
          { signal: abortController.signal }
        );

        // If aborted, don't process the response
        if (abortController.signal.aborted) {
          return;
        }

        const data = await response.json();

        if (data.error) {
          console.error("[Search] Error:", data.error);
          setSearchResults([]);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        // Only log error if not aborted
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error("[Search] Request error:", error);
          setSearchResults([]);
          setIsLoading(false);
        }
      }
    };

    performSearch();

    // Cleanup: abort on unmount or query change
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
    // First try to find in search results, fallback to direct video
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
            {!query && !hasSearched && !isLoading && (
              <SuggestedSearches />
            )}
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
        />
      )}
    </div>
  );
}
