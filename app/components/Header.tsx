import Demuxed from "./Demuxed";

export default function Header() {
  return (
    <div className="w-full mb-8 text-center flex flex-col items-center">
      <Demuxed className="h-8 sm:h-10 w-auto text-black" />
      <p className="text-xs sm:text-sm text-gray-600 uppercase tracking-widest mt-2">
        video archive
      </p>
    </div>
  );
}
