import Header from "./components/Header";
import SearchResultsGrid from "./components/SearchResultsGrid";
import SearchInput from "./components/SearchInput";
import VideoModal from "./components/VideoModal";
import { searchVideos, type VideoChunk } from "./db/videos";

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
  playbackId: string;
}

function chunkToMediaItem(chunk: VideoChunk): MediaItem {
  const duration = `${Math.floor(chunk.start_time / 60)}:${Math.floor(
    chunk.start_time % 60,
  )
    .toString()
    .padStart(2, "0")} - ${Math.floor(chunk.end_time / 60)}:${Math.floor(
    chunk.end_time % 60,
  )
    .toString()
    .padStart(2, "0")}`;

  return {
    id: chunk.chunk_id,
    title: chunk.title,
    description: chunk.description,
    duration: duration,
    thumbnail: `https://image.mux.com/${chunk.playback_id}/thumbnail.png?width=480&time=${chunk.start_time}`,
    startTime: chunk.start_time,
    endTime: chunk.end_time,
    chunkText: chunk.chunk_text,
    similarity: chunk.similarity,
    playbackId: chunk.playback_id,
  };
}

interface HomeProps {
  searchParams: Promise<{ q?: string; video?: string; time?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { q, video, time } = await searchParams;
  const query = q || "";
  const selectedVideoId = video;
  let videos: MediaItem[] = [];

  if (query.trim()) {
    try {
      const results = await searchVideos(query, 10);
      videos = results.map(chunkToMediaItem);
    } catch (error) {
      console.error("Error fetching video chunks:", error);
    }
  }

  const selectedVideo = selectedVideoId
    ? videos.find((v) => v.id === selectedVideoId)
    : null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-8 sm:pt-12">
      <div className="w-full px-8">
        <Header />
        <SearchInput initialQuery={query} />
      </div>

      <SearchResultsGrid results={videos} />

      {selectedVideo && (
        <VideoModal
          isOpen={true}
          playbackId={selectedVideo.playbackId}
          startTime={selectedVideo.startTime}
          title={selectedVideo.title}
        />
      )}
    </div>
  );
}
