import { useState } from "react";
import { Link } from "react-router-dom";
import { getStorePath } from "../utils/storeLinks";
import FeedTopTabs from "../components/FeedTopTabs";
import {
  FiHeart,
  FiMessageCircle,
  FiBookmark,
  FiSend,
  FiShoppingCart,
  FiVolume2,
  FiVolumeX,
} from "react-icons/fi";
import AuthModal from "../components/AuthModal";

function Reels() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [soundOnVideo, setSoundOnVideo] = useState<string | null>(null);
  const [activeTopTab, setActiveTopTab] = useState<"hot" | "vendors">("hot");

  function requireAuth() {
    setAuthModalOpen(true);
  }

  const reels = [
    {
      id: "jollof-rice-combo",
      seller: "Tasty Bowl",
      username: "tasty-bowl",
      product: "Jollof Rice Combo",
      price: "₦2,500",
      caption: "Fresh campus meals available today. Fast pickup and delivery.",
      videoUrl:
        "https://videos.pexels.com/video-files/3195944/3195944-uhd_2560_1440_25fps.mp4",
      likes: "3.8k",
      comments: "420",
      saves: "1.1k",
    },
    {
      id: "hair-styling-service",
      seller: "Beauty Corner",
      username: "beauty-corner",
      product: "Hair Styling Service",
      price: "₦4,000",
      caption: "Book campus hair styling and beauty service from your hostel.",
      videoUrl:
        "https://videos.pexels.com/video-files/3997798/3997798-uhd_2560_1440_25fps.mp4",
      likes: "2.1k",
      comments: "188",
      saves: "690",
    },
    {
      id: "campus-sneakers",
      seller: "Campus Wears",
      username: "campus-wears",
      product: "Campus Sneakers",
      price: "₦25,000",
      caption: "Fresh sneakers available for students around campus.",
      videoUrl:
        "https://videos.pexels.com/video-files/853919/853919-hd_1920_1080_25fps.mp4",
      likes: "5.2k",
      comments: "510",
      saves: "1.8k",
    },
    {
      id: "phone-repair",
      seller: "Gadget Fix",
      username: "gadget-fix",
      product: "Phone Repair Service",
      price: "From ₦3,000",
      caption: "Quick phone repairs, screen changes, and charging port fixes.",
      videoUrl:
        "https://videos.pexels.com/video-files/5082975/5082975-uhd_2560_1440_30fps.mp4",
      likes: "1.7k",
      comments: "140",
      saves: "420",
    },
    {
      id: "used-laptop",
      seller: "Campus Deals",
      username: "campusdeals",
      product: "Verified Used Laptop",
      price: "₦180,000",
      caption: "Verified used laptop available with campus pickup option.",
      videoUrl:
        "https://videos.pexels.com/video-files/3209828/3209828-uhd_2560_1440_25fps.mp4",
      likes: "4.4k",
      comments: "302",
      saves: "1.3k",
    },
    {
      id: "graphics-design",
      seller: "Design Hub",
      username: "design-hub",
      product: "Logo Design Service",
      price: "₦10,000",
      caption: "Clean logo, flyer, and social media designs for student brands.",
      videoUrl:
        "https://videos.pexels.com/video-files/3209829/3209829-uhd_2560_1440_25fps.mp4",
      likes: "1.2k",
      comments: "90",
      saves: "390",
    },
    {
      id: "laundry-service",
      seller: "Clean Plug",
      username: "clean-plug",
      product: "Laundry Service",
      price: "From ₦1,500",
      caption: "Campus laundry pickup and delivery for students.",
      videoUrl:
        "https://videos.pexels.com/video-files/856192/856192-hd_1920_1080_25fps.mp4",
      likes: "980",
      comments: "76",
      saves: "210",
    },
    {
      id: "bookstore",
      seller: "Book Plug",
      username: "book-plug",
      product: "Engineering Textbooks",
      price: "₦6,000",
      caption: "Academic books and materials for engineering students.",
      videoUrl:
        "https://videos.pexels.com/video-files/3045163/3045163-uhd_2560_1440_24fps.mp4",
      likes: "2.6k",
      comments: "230",
      saves: "820",
    },
    {
      id: "shawarma-campus",
      seller: "Snack Spot",
      username: "snack-spot",
      product: "Campus Shawarma",
      price: "₦2,000",
      caption: "Fresh shawarma, snacks, and drinks around campus.",
      videoUrl:
        "https://videos.pexels.com/video-files/3769033/3769033-uhd_2560_1440_25fps.mp4",
      likes: "3.1k",
      comments: "270",
      saves: "760",
    },
    {
      id: "makeup-service",
      seller: "Glow Studio",
      username: "glow-studio",
      product: "Makeup Service",
      price: "₦5,000",
      caption: "Makeup bookings for dinner nights, birthdays, and events.",
      videoUrl:
        "https://videos.pexels.com/video-files/3998449/3998449-uhd_2560_1440_25fps.mp4",
      likes: "2.9k",
      comments: "210",
      saves: "940",
    },
    {
      id: "football-jersey",
      seller: "Sport Plug",
      username: "sport-plug",
      product: "Football Jersey",
      price: "₦8,500",
      caption: "Club jerseys and sportswear available on campus.",
      videoUrl:
        "https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4",
      likes: "1.9k",
      comments: "120",
      saves: "510",
    },
    {
      id: "wristwatch",
      seller: "Time House",
      username: "time-house",
      product: "Classic Wristwatch",
      price: "₦12,000",
      caption: "Affordable wristwatches and accessories for students.",
      videoUrl:
        "https://videos.pexels.com/video-files/853889/853889-hd_1920_1080_25fps.mp4",
      likes: "1.4k",
      comments: "88",
      saves: "330",
    },
    {
      id: "printing-service",
      seller: "Print Hub",
      username: "printhub",
      product: "Printing & Typing",
      price: "From ₦200",
      caption: "Assignments, projects, photocopy, and academic typing services.",
      videoUrl:
        "https://videos.pexels.com/video-files/3184291/3184291-uhd_2560_1440_25fps.mp4",
      likes: "1.1k",
      comments: "105",
      saves: "410",
    },
    {
      id: "perfume-store",
      seller: "Scent Plug",
      username: "scent-plug",
      product: "Body Perfume",
      price: "₦3,500",
      caption: "Nice body sprays and perfumes available for students.",
      videoUrl:
        "https://videos.pexels.com/video-files/3769706/3769706-uhd_2560_1440_25fps.mp4",
      likes: "2.2k",
      comments: "190",
      saves: "620",
    },
    {
      id: "hostel-items",
      seller: "Hostel Market",
      username: "hostel-market",
      product: "Hostel Items",
      price: "From ₦4,000",
      caption: "Buy and sell hostel items, furniture, fans, buckets, and more.",
      videoUrl:
        "https://videos.pexels.com/video-files/3209821/3209821-uhd_2560_1440_25fps.mp4",
      likes: "3.5k",
      comments: "310",
      saves: "1.0k",
    },
  ];

  const ads = [
    {
      label: "Gadget Deal",
      title: "Gaming Mouse Razer Naga 2014",
      subtitle: "Smooth precision for study, design, and gaming.",
      price: "₦18,000",
      image:
        "https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=900&q=80",
      theme: "ad-gray",
    },
    {
      label: "Fresh Food",
      title: "Campus Rice Combo",
      subtitle: "Hot meals delivered around your campus.",
      price: "₦2,500",
      image:
        "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
      theme: "ad-green",
    },
    {
      label: "Fashion Drop",
      title: "New Sneakers Available",
      subtitle: "Clean fashion products from verified sellers.",
      price: "₦25,000",
      image:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
      theme: "ad-orange",
    },
    {
      label: "Student Tech",
      title: "Phone Accessories",
      subtitle: "Affordable accessories around campus.",
      price: "₦3,000",
      image:
        "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=900&q=80",
      theme: "ad-blue",
    },
  ];

  const services = [
    "Hair styling and beauty services",
    "Graphic design and branding",
    "Laundry and shoe cleaning",
    "Phone and laptop repairs",
    "Printing and academic typing",
  ];

 return (
  <>
    <section className="reels-page">
      <FeedTopTabs
        activeTab={activeTopTab}
        onTabChange={setActiveTopTab}
        onRequireAuth={requireAuth}
      />

      <div className="reels-layout">
          <div className="reels-feed">
            {reels.map((reel) => {
              const soundOn = soundOnVideo === reel.id;

              return (
                <article className="reel-card" key={reel.id}>
                  <video
                    src={reel.videoUrl}
                    autoPlay
                    loop
                    muted={!soundOn}
                    playsInline
                  />

                  <div className="reel-gradient"></div>

                  <button
                    className="reel-sound-btn"
                    onClick={() => setSoundOnVideo(soundOn ? null : reel.id)}
                  >
                    {soundOn ? <FiVolume2 /> : <FiVolumeX />}
                  </button>

                  <div className="reel-info">
                    <div className="reel-seller-row">
  <Link to={getStorePath(reel.username)} className="reel-seller-link">
    <div className="reel-avatar">{reel.seller.charAt(0)}</div>

    <div>
      <h3>{reel.seller}</h3>
      <p>@{reel.username}</p>
    </div>
  </Link>

  <button onClick={requireAuth}>Follow</button>
</div>

                    <h2>{reel.product}</h2>
                    <strong>{reel.price}</strong>
                    <p>{reel.caption}</p>
                  </div>

                  <div className="reel-actions">
                    <button onClick={requireAuth}>
                      <FiHeart />
                      <span>{reel.likes}</span>
                    </button>

                    <button onClick={requireAuth}>
                      <FiMessageCircle />
                      <span>{reel.comments}</span>
                    </button>

                    <button onClick={requireAuth}>
                      <FiBookmark />
                      <span>{reel.saves}</span>
                    </button>

                    <button onClick={requireAuth}>
                      <FiSend />
                      <span>Share</span>
                    </button>

                    <button className="reel-cart-btn" onClick={requireAuth}>
                      <FiShoppingCart />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="reels-right-panel">
            <div className="reels-ad-slider">
              <div className="reels-ad-track">
                {ads.map((ad) => (
                  <article className={`reels-ad-card ${ad.theme}`} key={ad.title}>
                    <button className="ad-close-btn">×</button>

                    <div className="ad-image-wrap">
                      <img src={ad.image} alt={ad.title} />
                    </div>

                    <div className="ad-content">
                      <span>{ad.label}</span>
                      <h3>{ad.title}</h3>
                      <p>{ad.subtitle}</p>
                      <strong>{ad.price}</strong>

                      <div className="ad-actions">
                        <button onClick={requireAuth}>
                          <FiShoppingCart />
                        </button>

                        <button onClick={requireAuth}>View More</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="trending-services-box">
              <h3>Trending service offers</h3>
              <p>
                Discover campus service providers with images, video content, and
                seller profiles.
              </p>

              <div className="service-offer-list">
                {services.map((service) => (
                  <button key={service} onClick={requireAuth}>
                    {service}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export default Reels;