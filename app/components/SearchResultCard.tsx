interface MediaItem {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnail: string;
}

interface SearchResultCardProps {
  item: MediaItem;
}

export default function SearchResultCard({ item }: SearchResultCardProps) {
  return (
    <div className="search-result-card bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      <div className="aspect-video bg-gray-200 dark:bg-gray-700 relative">
        <img
          src={item.thumbnail}
          alt={item.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
          {item.duration}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 mb-2">
          {item.title}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
          {item.description}
        </p>
      </div>
    </div>
  );
}