import { useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

type ProductMediaCarouselProps = {
  product: {
    name: string;
    images: string[];
  };
};

function ProductMediaCarousel({ product }: ProductMediaCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sliderRef = useRef<HTMLDivElement | null>(null);

  const mediaItems = product.images.map((image) => ({
    type: "image" as const,
    url: image,
  }));

  function scrollToMedia(index: number) {
    if (!sliderRef.current) return;

    sliderRef.current.scrollTo({
      left: sliderRef.current.clientWidth * index,
      behavior: "smooth",
    });

    setActiveIndex(index);
  }

  function nextMedia() {
    const nextIndex = activeIndex === mediaItems.length - 1 ? 0 : activeIndex + 1;
    scrollToMedia(nextIndex);
  }

  function previousMedia() {
    const previousIndex =
      activeIndex === 0 ? mediaItems.length - 1 : activeIndex - 1;

    scrollToMedia(previousIndex);
  }

  function handleScroll() {
    if (!sliderRef.current) return;

    const index = Math.round(
      sliderRef.current.scrollLeft / sliderRef.current.clientWidth
    );

    setActiveIndex(index);
  }

  return (
    <div className="product-media-area">
      <div
        className="product-media-slider"
        ref={sliderRef}
        onScroll={handleScroll}
      >
        {mediaItems.map((item, index) => (
          <div className="product-media-slide" key={item.url}>
            <img src={item.url} alt={`${product.name} ${index + 1}`} />
          </div>
        ))}
      </div>

      {mediaItems.length > 1 && (
        <>
          <button
            type="button"
            className="product-media-arrow product-media-left"
            onClick={previousMedia}
            aria-label="Previous image"
          >
            <FiChevronLeft />
          </button>

          <button
            type="button"
            className="product-media-arrow product-media-right"
            onClick={nextMedia}
            aria-label="Next image"
          >
            <FiChevronRight />
          </button>

          <div className="product-media-dots">
            {mediaItems.map((_, index) => (
              <button
                type="button"
                key={index}
                className={activeIndex === index ? "active" : ""}
                onClick={() => scrollToMedia(index)}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}

      <div className="product-thumbnails">
        {mediaItems.map((item, index) => (
          <button
            type="button"
            key={`thumb-${item.url}`}
            className={activeIndex === index ? "active" : ""}
            onClick={() => scrollToMedia(index)}
            aria-label={`View ${product.name} image ${index + 1}`}
          >
            <img src={item.url} alt={`${product.name} thumbnail ${index + 1}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default ProductMediaCarousel;
