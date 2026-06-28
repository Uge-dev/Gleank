import { useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import AuthModal from "../components/AuthModal";
import ProductCard from "../components/ProductCard";

type ExploreTag =
  | "All"
  | "Trending"
  | "Fashion"
  | "Food"
  | "Gadgets"
  | "Books"
  | "Academic"
  | "Services"
  | "Used Market"
  | "Reels"
  | "Beauty"
  | "Sports"
  | "Gaming"
  | "Music"
  | "New Vendors";

function Explore() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeTag, setActiveTag] = useState<ExploreTag>("All");
  const tagRowRef = useRef<HTMLDivElement | null>(null);

  function requireAuth() {
    setAuthModalOpen(true);
  }

  function scrollTags(direction: "left" | "right") {
    if (!tagRowRef.current) return;

    tagRowRef.current.scrollBy({
      left: direction === "right" ? 260 : -260,
      behavior: "smooth",
    });
  }

  const tags: ExploreTag[] = [
    "All",
    "Trending",
    "Fashion",
    "Food",
    "Gadgets",
    "Books",
    "Academic",
    "Services",
    "Used Market",
    "Reels",
    "Beauty",
    "Sports",
    "Gaming",
    "Music",
    "New Vendors",
  ];

  const products = [
    {
      id: "trendy-sneakers",
      name: "Trendy Sneakers",
      price: "₦25,000",
      category: "Fashion",
      campus: "FUPRE",
      seller: "Campus Wears",
      mediaType: "image" as const,
      tag: "Trending",
      imageUrl:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
      tags: ["All", "Trending", "Fashion"],
    },
    {
      id: "jollof-rice-combo",
      name: "Jollof Rice Combo",
      price: "₦2,500",
      category: "Food",
      campus: "FUPRE",
      seller: "Tasty Bowl",
      mediaType: "video" as const,
      tag: "Reel",
      videoUrl:
        "https://videos.pexels.com/video-files/3195944/3195944-uhd_2560_1440_25fps.mp4",
      tags: ["All", "Trending", "Food", "Reels"],
    },
    {
      id: "phone-accessory",
      name: "Phone Pouch",
      price: "₦3,000",
      category: "Gadgets",
      campus: "FUPRE",
      seller: "Gadget Hub",
      mediaType: "image" as const,
      tag: "New",
      imageUrl:
        "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=900&q=80",
      tags: ["All", "Gadgets"],
    },
    {
      id: "engineering-textbook",
      name: "Engineering Textbook",
      price: "₦6,000",
      category: "Academic",
      campus: "FUPRE",
      seller: "Book Plug",
      mediaType: "image" as const,
      tag: "Student Deal",
      imageUrl:
        "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80",
      tags: ["All", "Books", "Academic"],
    },
    {
      id: "hair-styling",
      name: "Hair Styling Service",
      price: "₦4,000",
      category: "Beauty",
      campus: "FUPRE",
      seller: "Beauty Corner",
      mediaType: "video" as const,
      tag: "Reel",
      videoUrl:
        "https://videos.pexels.com/video-files/3997798/3997798-uhd_2560_1440_25fps.mp4",
      tags: ["All", "Beauty", "Services", "Reels"],
    },
    {
      id: "used-laptop",
      name: "Used HP Laptop",
      price: "₦180,000",
      category: "Used Market",
      campus: "FUPRE",
      seller: "Campus Deals",
      mediaType: "image" as const,
      tag: "Verified Used",
      imageUrl:
        "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80",
      tags: ["All", "Used Market", "Gadgets"],
    },
    {
      id: "football-jersey",
      name: "Football Jersey",
      price: "₦8,500",
      category: "Sports",
      campus: "FUPRE",
      seller: "Sport Plug",
      mediaType: "image" as const,
      tag: "Sports",
      imageUrl:
        "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=900&q=80",
      tags: ["All", "Sports"],
    },
    {
      id: "graphics-design",
      name: "Logo Design Service",
      price: "₦10,000",
      category: "Services",
      campus: "FUPRE",
      seller: "Design Hub",
      mediaType: "image" as const,
      tag: "Service",
      imageUrl:
        "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=900&q=80",
      tags: ["All", "Services", "New Vendors"],
    },
  ];

  const filteredProducts =
    activeTag === "All"
      ? products
      : products.filter((product) => product.tags.includes(activeTag));

  return (
    <>
      <section className="explore-page">
        <div className="explore-sticky-top">

          <div className="explore-tags-shell">
            <button
              className="tag-scroll-btn tag-scroll-left"
              onClick={() => scrollTags("left")}
              aria-label="Scroll tags left"
            >
              <FiChevronLeft />
            </button>

            <div className="explore-tags-row" ref={tagRowRef}>
              {tags.map((tag) => (
                <button
                  key={tag}
                  className={activeTag === tag ? "active" : ""}
                  onClick={() => setActiveTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>

            <button
              className="tag-scroll-btn tag-scroll-right"
              onClick={() => scrollTags("right")}
              aria-label="Scroll tags right"
            >
              <FiChevronRight />
            </button>
          </div>
        </div>

        <div className="explore-grid">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              name={product.name}
              price={product.price}
              category={product.category}
              campus={product.campus}
              seller={product.seller}
              mediaType={product.mediaType}
              imageUrl={product.imageUrl}
              videoUrl={product.videoUrl}
              tag={product.tag}
              onRequireAuth={requireAuth}
            />
          ))}
        </div>
      </section>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  );
}

export default Explore;