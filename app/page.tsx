"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import SearchResultsGrid from "./components/SearchResultsGrid";

const mockResults = [
  {
    id: "1",
    title: "Introduction to React Hooks",
    description: "Learn the fundamentals of React Hooks and how they can simplify your component logic.",
    duration: "12:34",
    thumbnail: "https://picsum.photos/320/180?random=1"
  },
  {
    id: "2", 
    title: "Advanced TypeScript Patterns",
    description: "Explore advanced TypeScript patterns and techniques for better code organization.",
    duration: "18:45",
    thumbnail: "https://picsum.photos/320/180?random=2"
  },
  {
    id: "3",
    title: "Building Modern APIs",
    description: "Best practices for creating scalable and maintainable REST APIs.",
    duration: "25:12",
    thumbnail: "https://picsum.photos/320/180?random=3"
  },
  {
    id: "4",
    title: "CSS Grid Layout Guide",
    description: "Master CSS Grid with practical examples and real-world use cases.",
    duration: "15:23",
    thumbnail: "https://picsum.photos/320/180?random=4"
  },
  {
    id: "5",
    title: "Database Design Principles",
    description: "Learn the fundamental principles of effective database design and normalization.",
    duration: "22:56",
    thumbnail: "https://picsum.photos/320/180?random=5"
  },
  {
    id: "6",
    title: "Next.js Performance Optimization",
    description: "Techniques to optimize your Next.js applications for better performance.",
    duration: "19:08",
    thumbnail: "https://picsum.photos/320/180?random=6"
  }
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-16 sm:pt-24">
      <div className="w-full px-8">
        <div className="w-full relative bg-white dark:bg-gray-900 border-4 border-black dark:border-white shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#fff] focus-within:shadow-[12px_12px_0px_0px_#000] dark:focus-within:shadow-[12px_12px_0px_0px_#fff] transition-shadow">
          <div className="flex items-center">
            <div className="p-4 border-r-4 border-black dark:border-white">
              <Search className="w-16 h-16 sm:w-20 sm:h-20 text-black dark:text-white" strokeWidth={3} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder=""
              className="flex-1 text-4xl sm:text-6xl lg:text-8xl font-bold text-black dark:text-white bg-transparent border-none outline-none p-4 uppercase font-[family-name:var(--font-bebas-neue)]"
              autoFocus
            />
          </div>
        </div>
      </div>
      
      <SearchResultsGrid results={searchQuery ? mockResults : []} />
    </div>
  );
}
