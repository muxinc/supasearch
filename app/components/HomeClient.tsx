"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { fetchRealtimeSubscriptionToken } from "../actions/get-subscribe-token";
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
  const searchIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const query = searchParams.get("q") || "";
  const selectedVideoId = searchParams.get("video");
  const clipParam = searchParams.get("clip");
  const selectedClipIndex = clipParam ? Number.parseInt(clipParam, 10) : 0;

  // Token fetcher for realtime subscription
  const getToken = useCallback(async () => {
    console.log("[Token Fetch] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Token Fetch] getToken called");
    console.log("[Token Fetch] searchIdRef.current:", searchIdRef.current);
    console.log("[Token Fetch] searchId state:", searchId);

    if (!searchIdRef.current) {
      console.error("[Token Fetch] ❌ No active search ID for token fetch");
      throw new Error("No active search ID");
    }

    console.log(`[Token Fetch] 🔑 Fetching subscription token for search ${searchIdRef.current}`);

    try {
      const token = await fetchRealtimeSubscriptionToken(searchIdRef.current);
      console.log("[Token Fetch] ✅ Token received successfully:", {
        hasToken: !!token,
        channel: `search:${searchIdRef.current}`,
        expiresAt: token.expiresAt
      });
      return token;
    } catch (error) {
      console.error("[Token Fetch] ❌ Error fetching token:", error);
      throw error;
    }
  }, [searchId]);

  // Fetch token when searchId changes
  useEffect(() => {
    if (!searchId) {
      setSubscriptionToken(null);
      return;
    }

    console.log(`[Token Setup] SearchId changed to ${searchId}, fetching token...`);

    // Clear previous subscription token to force re-subscription
    setSubscriptionToken(null);

    fetchRealtimeSubscriptionToken(searchId)
      .then((token) => {
        console.log(`[Token Setup] ✅ Token fetched for ${searchId}:`, token);
        setSubscriptionToken(token);
      })
      .catch((error) => {
        console.error(`[Token Setup] ❌ Failed to fetch token:`, error);
      });
  }, [searchId]);

  // Subscribe to realtime updates
  const subscriptionConfig = {
    token: subscriptionToken,
    refreshToken: getToken,
    // Only subscribe when we have a token
    enabled: !!subscriptionToken,
  };

  console.log("[Subscription Config]", {
    hasToken: !!subscriptionConfig.token,
    hasRefreshToken: !!subscriptionConfig.refreshToken,
    enabled: subscriptionConfig.enabled,
    searchId: searchId,
  });

  const {
    data: realtimeMessages,
    error: subscriptionError,
    state: subscriptionState,
    freshData,
    latestData
  } = useInngestSubscription(subscriptionConfig);

  // Log subscription state changes with detailed debugging
  useEffect(() => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Realtime Debug] Full state snapshot:");
    console.log("[Realtime Debug] - State:", subscriptionState);
    console.log("[Realtime Debug] - SearchId:", searchId);
    console.log("[Realtime Debug] - Total messages (data):", realtimeMessages?.length || 0);
    console.log("[Realtime Debug] - Fresh messages:", freshData?.length || 0);
    console.log("[Realtime Debug] - Latest message:", latestData);
    console.log("[Realtime Debug] - Raw data array:", realtimeMessages);
    console.log("[Realtime Debug] - Error:", subscriptionError);

    if (realtimeMessages && realtimeMessages.length > 0) {
      console.log("[Realtime Debug] - First message structure:", {
        fullMessage: realtimeMessages[0],
        hasTopic: 'topic' in realtimeMessages[0],
        hasData: 'data' in realtimeMessages[0],
        keys: Object.keys(realtimeMessages[0])
      });
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }, [subscriptionState, subscriptionError, realtimeMessages, freshData, latestData, searchId]);

  // Process realtime messages
  useEffect(() => {
    console.log("[Message Processing] Effect triggered");
    console.log("[Message Processing] realtimeMessages:", realtimeMessages);
    console.log("[Message Processing] length:", realtimeMessages?.length);
    console.log("[Message Processing] type:", typeof realtimeMessages);
    console.log("[Message Processing] isArray:", Array.isArray(realtimeMessages));

    if (!realtimeMessages || realtimeMessages.length === 0) {
      console.log("[Message Processing] ⚠️ No messages to process (empty or null)");
      return;
    }

    // Only process messages if we still have an active search
    if (!searchId) {
      console.log("[Message Processing] ⚠️ No active searchId, ignoring messages");
      return;
    }

    console.log(`[Message Processing] ✅ Processing ${realtimeMessages.length} total messages`);
    console.log("[Message Processing] All messages:", JSON.stringify(realtimeMessages, null, 2));

    // Process each message
    for (let i = 0; i < realtimeMessages.length; i++) {
      const message = realtimeMessages[i];
      console.log(`[Message Processing] ─────────────────────────────────`);
      console.log(`[Message Processing] Message ${i + 1}/${realtimeMessages.length}`);
      console.log("[Message Processing] Full message object:", message);
      console.log("[Message Processing] Message keys:", Object.keys(message));
      console.log("[Message Processing] Topic:", message.topic);
      console.log("[Message Processing] Data type:", typeof message.data);
      console.log("[Message Processing] Data:", message.data);

      if (message.topic === "videos") {
        // Initial video results
        console.log("[Message Processing] 🎬 Processing 'videos' message");
        console.log("[Message Processing] Raw data:", message.data);

        const { videos, status } = message.data as {
          videos: VideoSearchResult[];
          status: "initial" | "processing" | "completed";
        };

        console.log(`[Message Processing] Parsed videos count: ${videos?.length || 0}`);
        console.log(`[Message Processing] Status: ${status}`);
        console.log(`[Message Processing] First video:`, videos?.[0]);

        if (videos && videos.length > 0) {
          console.log(`[Message Processing] ✅ Setting ${videos.length} videos to state`);
          setSearchResults(videos);
          setClipsRemaining(videos.length);
          console.log(`[Message Processing] State update dispatched`);
        } else {
          console.warn("[Message Processing] ⚠️ No videos in message");
        }

        if (status === "completed" && (!videos || videos.length === 0)) {
          console.log("[Message Processing] Completed with no videos, stopping loading");
          setIsLoading(false);
        }
      } else if (message.topic === "clips") {
        // Individual clip results
        console.log("[Message Processing] 🎞️ Processing 'clips' message");

        const { videoId, clips } = message.data as {
          videoId: string;
          clips: Array<{
            start_time_seconds: number;
            end_time_seconds: number;
            snippet: string;
            relevance: "exact" | "related";
          }>;
        };

        console.log(`[Message Processing] Video ID: ${videoId}`);
        console.log(`[Message Processing] Clips count: ${clips.length}`);
        console.log(`[Message Processing] Clips:`, clips);

        // Update the specific video with clips
        setSearchResults((prev) => {
          console.log("[Message Processing] Current search results count:", prev.length);
          const updated = prev.map((result) =>
            result.video.id === videoId
              ? { ...result, clips }
              : result
          );
          console.log("[Message Processing] Updated search results");
          return updated;
        });

        // Decrement clips remaining
        setClipsRemaining((prev) => {
          const remaining = prev - 1;
          console.log(`[Message Processing] Clips remaining: ${remaining}`);
          if (remaining <= 0) {
            console.log("[Message Processing] All clips received, stopping loading");
            setIsLoading(false);
          }
          return remaining;
        });
      } else if (message.topic === "error") {
        // Error for a specific video
        console.log("[Message Processing] ❌ Processing 'error' message");

        const { videoId, message: errorMessage } = message.data as {
          videoId?: string;
          message: string;
        };

        console.error(`[Message Processing] Error for video ${videoId}:`, errorMessage);

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
      } else {
        console.warn(`[Message Processing] ⚠️ Unknown topic: ${message.topic}`);
      }
    }

    console.log("[Message Processing] ✅ Finished processing all messages");
  }, [realtimeMessages]);

  // Debug: Log when searchId changes
  useEffect(() => {
    console.log(`[Client] searchId changed to:`, searchId);
    console.log(`[Client] Subscription enabled:`, !!searchId);
  }, [searchId]);

  // Start search when query changes
  useEffect(() => {
    const performSearch = async () => {
      // Cancel any previous search
      if (abortControllerRef.current) {
        console.log("[Client] Cancelling previous search");
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (!query.trim()) {
        console.log("[Client] Empty query, resetting state");
        setSearchResults([]);
        setHasSearched(false);
        setSearchId(null);
        searchIdRef.current = null;
        setSubscriptionToken(null);
        return;
      }

      // Create a new AbortController for this search
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Generate a unique search ID BEFORE starting the job
      const newSearchId = crypto.randomUUID();
      console.log(`[Client] Generated search ID: ${newSearchId}`);

      // Set search ID immediately so subscription can start
      setSearchId(newSearchId);
      searchIdRef.current = newSearchId;

      console.log(`[Client] Starting search for query: "${query}"`);
      setIsLoading(true);
      setHasSearched(true);
      setSearchResults([]);
      setClipsRemaining(0);

      try {
        // Start the search job with our pre-generated searchId
        console.log("[Client] Calling /api/search with searchId...");
        const response = await fetch(
          `/api/search?${new URLSearchParams({ q: query, searchId: newSearchId })}`,
          { signal: abortController.signal }
        );

        // If aborted, don't process the response
        if (abortController.signal.aborted) {
          console.log("[Client] Search was cancelled");
          return;
        }

        const data = await response.json();

        if (data.error) {
          console.error("[Client] Search error:", data.error);
          setSearchResults([]);
          setIsLoading(false);
          return;
        }

        console.log(`[Client] ✅ Job started, already subscribed to channel`);
      } catch (error) {
        // Only log error if not aborted
        if (error instanceof Error && error.name === 'AbortError') {
          console.log("[Client] Search request aborted");
        } else {
          console.error("[Client] Search error:", error);
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
            <div className="max-w-2xl mx-auto">
              <Header />
              <SearchInput initialQuery={query} />
            </div>

            {/* Loading indicator for waterfall UX (shown while clips load) */}
            {isLoading && (
              <div className="max-w-lg mx-auto mt-4 flex items-center justify-center gap-3 bg-white/80 px-4 py-3 rounded-lg">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                <div className="text-sm text-gray-900">
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
                <div className="inline-flex items-center gap-3 bg-white px-6 py-4 rounded-lg shadow-md">
                  <div className="w-6 h-6 border-3 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                  <div className="text-left">
                    <div className="font-semibold text-gray-900">
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
          startTime={selectedClip?.startTime || 0}
          title={selectedVideo.video.title}
        />
      )}
    </div>
  );
}
