import { Link } from "react-router-dom";
import { FiHeart, FiPlayCircle } from "react-icons/fi";
import type { SearchReel } from "../data/searchData";

type SearchReelCardProps = {
  reel: SearchReel;
};

function SearchReelCard({ reel }: SearchReelCardProps) {
  return (
    <Link to="/reels" className="search-reel-card">
      <div className="search-reel-media">
        <video src={reel.videoUrl} autoPlay loop muted playsInline />
        <span>
          <FiPlayCircle />
          Reel
        </span>
      </div>

      <div className="search-reel-body">
        <h3>{reel.title}</h3>
        <p>@{reel.username}</p>

        <div>
          <span>{reel.views} views</span>

          <span>
            <FiHeart />
            {reel.likes}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default SearchReelCard;