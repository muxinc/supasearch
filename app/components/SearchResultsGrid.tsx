import SearchResultCard from "./SearchResultCard";

interface MediaItem {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnail: string;
}

interface SearchResultsGridProps {
  results: MediaItem[];
}

export default function SearchResultsGrid({ results }: SearchResultsGridProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="mt-12 px-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {results.map((item) => (
          <SearchResultCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}