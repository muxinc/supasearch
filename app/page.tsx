import Header from "./components/Header";
import SearchResultsGrid from "./components/SearchResultsGrid";
import SearchInput from "./components/SearchInput";
import { searchVideos, type Video } from "./db/videos";

interface MediaItem {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnail: string;
}

function videoToMediaItem(video: Video): MediaItem {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    duration: "N/A", // Duration not available from Mux asset data
    thumbnail: `https://image.mux.com/${video.mux_asset_id}/thumbnail.png?width=320&height=180`
  };
}

interface HomeProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { q } = await searchParams;
  const query = q || "";
  let videos: MediaItem[] = [];

  if (query.trim()) {
    try {
      const results = await searchVideos(query, 10);
      videos = results.map(videoToMediaItem);
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-8 sm:pt-12">
      <div className="w-full px-8">
        <Header />
        <SearchInput initialQuery={query} />
      </div>

      <SearchResultsGrid results={videos} />
    </div>
  );
}
