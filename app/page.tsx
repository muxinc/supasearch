import Header from "./components/Header";
import SearchResultsGrid from "./components/SearchResultsGrid";
import SearchInput from "./components/SearchInput";
import VideoModal from "./components/VideoModal";
import Footer from "./components/Footer";
import { searchVideosWithReranking, type VideoSearchResult } from "./db/videos";

interface HomeProps {
  searchParams: Promise<{ q?: string; video?: string; clip?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { q, video, clip } = await searchParams;
  const query = q || "";
  const selectedVideoId = video;
  const selectedClipIndex = clip ? Number.parseInt(clip, 10) : 0;
  let searchResults: VideoSearchResult[] = [];

  if (query.trim()) {
    try {
      searchResults = await searchVideosWithReranking(query);
    } catch (error) {
      console.error("Error fetching video search results:", error);
    }
  }

  // Find selected video and clip
  let selectedVideo: VideoSearchResult | null = null;
  let selectedClip: { startTime: number; endTime: number } | null = null;

  if (selectedVideoId) {
    selectedVideo =
      searchResults.find((result) => result.video.id === selectedVideoId) ||
      null;
    if (selectedVideo && selectedVideo.clips[selectedClipIndex]) {
      const clip = selectedVideo.clips[selectedClipIndex];
      selectedClip = {
        startTime: clip.start_time_seconds,
        endTime: clip.end_time_seconds,
      };
    }
  }

  const hasResults = searchResults.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#d4cfc3]">
      {hasResults ? (
        <>
          <div className="w-full px-8 pt-8 sm:pt-12">
            <Header />
            <SearchInput initialQuery={query} />
          </div>
          <SearchResultsGrid results={searchResults} />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-full max-w-2xl">
            <Header />
            <SearchInput initialQuery={query} />
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
