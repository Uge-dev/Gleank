import { useEffect, useMemo, useState } from "react";
import {
  FiAtSign,
  FiHeart,
  FiImage,
  FiMessageCircle,
  FiSend,
  FiSmile,
  FiX,
} from "react-icons/fi";

import {
  commentOnPublicProduct,
  getPublicProduct,
} from "../services/marketplace.service";
import type { ProductComment } from "../types/domain";

type ProductCommentDrawerProps = {
  isOpen: boolean;
  productId: string | null;
  productName?: string;
  onClose: () => void;
  onRequireAuth: () => boolean;
  onCommentCreated?: () => void;
};

type FlexibleComment = ProductComment & {
  userName?: string;
  authorName?: string;
  createdAt?: string;
  created_at?: string;
  author?: {
    name?: string;
    avatarUrl?: string | null;
  };
  user?: {
    name?: string;
    avatarUrl?: string | null;
  };
};

function getCommentAuthor(comment: ProductComment) {
  const item = comment as FlexibleComment;

  return (
    item.userName ||
    item.authorName ||
    item.user?.name ||
    item.author?.name ||
    "Gleank user"
  );
}

function getCommentInitial(comment: ProductComment) {
  return getCommentAuthor(comment).slice(0, 1).toUpperCase();
}

function getCommentDate(comment: ProductComment) {
  const item = comment as FlexibleComment;
  const rawDate = item.createdAt || item.created_at;

  if (!rawDate) return "";

  const date = new Date(rawDate);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  }).format(
    Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    "day",
  );
}

function ProductCommentDrawer({
  isOpen,
  productId,
  productName,
  onClose,
  onRequireAuth,
  onCommentCreated,
}: ProductCommentDrawerProps) {
  const [comments, setComments] = useState<ProductComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => {
    const count = comments.length;
    return `${count} ${count === 1 ? "comment" : "comments"}`;
  }, [comments.length]);

  useEffect(() => {
    if (!isOpen || !productId) return;

    let active = true;

    setIsLoading(true);
    setError("");

    void getPublicProduct(productId)
      .then((response) => {
        if (!active) return;

        const responseWithComments = response as typeof response & {
          comments?: ProductComment[];
        };

        setComments(responseWithComments.comments || []);
      })
      .catch((requestError) => {
        if (!active) return;

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Comments could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, productId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.classList.add("comment-drawer-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("comment-drawer-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!productId) return;

    const body = commentBody.trim();

    if (!body) return;
    if (!onRequireAuth()) return;

    setIsSending(true);
    setError("");

    try {
      const response = await commentOnPublicProduct(productId, body);

      setComments((current) => [response.comment, ...current]);
      setCommentBody("");
      onCommentCreated?.();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Comment could not be sent.",
      );
    } finally {
      setIsSending(false);
    }
  }

  if (!isOpen || !productId) return null;

  return (
    <div className="product-comment-drawer-layer" role="dialog" aria-modal="true">
      <button
        type="button"
        className="product-comment-backdrop"
        onClick={onClose}
        aria-label="Close comments"
      />

      <section className="product-comment-drawer">
        <div className="product-comment-handle" />

        <header className="product-comment-header">
          <div>
            <h2>{title}</h2>
            {productName && <p>{productName}</p>}
          </div>

          <button type="button" onClick={onClose} aria-label="Close comments">
            <FiX />
          </button>
        </header>

        <div className="product-comment-list">
          {isLoading ? (
            <div className="product-comment-status">
              <FiMessageCircle />
              <p>Loading comments...</p>
            </div>
          ) : error ? (
            <div className="product-comment-status error">
              <FiMessageCircle />
              <p>{error}</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="product-comment-status">
              <FiMessageCircle />
              <h3>No comments yet</h3>
              <p>Be the first to comment on this product.</p>
            </div>
          ) : (
            comments.map((comment) => (
              <article className="product-comment-item" key={comment.id}>
                <div className="product-comment-avatar">
                  {getCommentInitial(comment)}
                </div>

                <div className="product-comment-content">
                  <div className="product-comment-line">
                    <strong>{getCommentAuthor(comment)}</strong>
                    <button type="button" aria-label="Like comment">
                      <FiHeart />
                    </button>
                  </div>

                  <p>{comment.body}</p>

                  <div className="product-comment-meta">
                    <span>{getCommentDate(comment)}</span>
                    <button type="button">Reply</button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <form className="product-comment-form" onSubmit={handleSubmit}>
          <div className="product-comment-form-avatar">G</div>

          <div className="product-comment-input-wrap">
            <input
              type="text"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Add comment..."
              maxLength={500}
            />

            <button type="button" aria-label="Add image">
              <FiImage />
            </button>

            <button type="button" aria-label="Emoji">
              <FiSmile />
            </button>

            <button type="button" aria-label="Mention">
              <FiAtSign />
            </button>
          </div>

          <button
            type="submit"
            className="product-comment-send"
            disabled={isSending || !commentBody.trim()}
            aria-label="Send comment"
          >
            <FiSend />
          </button>
        </form>
      </section>
    </div>
  );
}

export default ProductCommentDrawer;