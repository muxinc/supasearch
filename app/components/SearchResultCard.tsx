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
    <div className="search-result-card bg-white dark:bg-gray-900 border-4 border-black dark:border-white shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#fff] hover:shadow-[12px_12px_0px_0px_#000] dark:hover:shadow-[12px_12px_0px_0px_#fff] transition-shadow overflow-hidden">
      <div className="aspect-video bg-gray-200 dark:bg-gray-700 relative">
        <img
          src={item.thumbnail}
          alt={item.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 right-2 bg-black text-white text-xs px-2 py-1 border-2 border-white font-bold">
          {item.duration}
        </div>
      </div>
      <div className="p-4 border-t-4 border-black dark:border-white">
        <h3 className="font-bold text-gray-900 dark:text-white line-clamp-2 mb-3 uppercase tracking-wider text-sm">
          {item.title}
        </h3>
        <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3 font-medium">
          {item.description}
        </p>
      </div>
    </div>
  );
}