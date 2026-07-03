import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  FiAtSign,
  FiHeart,
  FiImage,
  FiMessageCircle,
  FiSend,
  FiSmile,
  FiTrash2,
  FiX,
} from "react-icons/fi";

import {
  commentOnPublicProduct,
  deleteProductComment,
  getPublicProduct,
  likeProductComment,
  unlikeProductComment,
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
    "Gleenc user"
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [comments, setComments] = useState<ProductComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [replyTarget, setReplyTarget] = useState<ProductComment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeCommentAction, setActiveCommentAction] = useState("");
  const [error, setError] = useState("");

  const title = useMemo(() => {
    const count = comments.filter((comment) => !comment.isDeleted).length;
    return `${count} ${count === 1 ? "comment" : "comments"}`;
  }, [comments]);

  useEffect(() => {
    if (!isOpen || !productId) return;

    let active = true;

    setIsLoading(true);
    setError("");
    setReplyTarget(null);

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

  function replaceComment(updatedComment: ProductComment) {
    setComments((current) =>
      current.map((comment) =>
        comment.id === updatedComment.id ? updatedComment : comment,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!productId) return;

    const body = commentBody.trim();

    if (!body) return;
    if (!onRequireAuth()) return;

    setIsSending(true);
    setError("");

    try {
      const response = await commentOnPublicProduct(
        productId,
        body,
        replyTarget?.id || null,
      );

      setComments((current) => [response.comment, ...current]);
      setCommentBody("");
      setReplyTarget(null);
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

  async function toggleCommentLike(comment: ProductComment) {
    if (!productId || comment.isDeleted) return;
    if (!onRequireAuth()) return;

    setActiveCommentAction(`${comment.id}:like`);
    setError("");

    try {
      const response = comment.liked
        ? await unlikeProductComment(productId, comment.id)
        : await likeProductComment(productId, comment.id);

      replaceComment(response.comment);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Comment like could not be updated.",
      );
    } finally {
      setActiveCommentAction("");
    }
  }

  async function handleDelete(comment: ProductComment) {
    if (!productId || !comment.canDelete || comment.isDeleted) return;
    if (!onRequireAuth()) return;

    setActiveCommentAction(`${comment.id}:delete`);
    setError("");

    try {
      const response = await deleteProductComment(productId, comment.id);
      replaceComment(response.comment);

      if (replyTarget?.id === comment.id) {
        setReplyTarget(null);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Comment could not be deleted.",
      );
    } finally {
      setActiveCommentAction("");
    }
  }

  function startReply(comment: ProductComment) {
    if (comment.isDeleted) return;
    if (!onRequireAuth()) return;

    setReplyTarget(comment);
    window.setTimeout(() => inputRef.current?.focus(), 0);
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
              <article
                className={
                  comment.parentCommentId
                    ? "product-comment-item product-comment-reply"
                    : "product-comment-item"
                }
                key={comment.id}
              >
                <div className="product-comment-avatar">
                  {getCommentInitial(comment)}
                </div>

                <div className="product-comment-content">
                  <div className="product-comment-line">
                    <strong>{getCommentAuthor(comment)}</strong>
                    <div className="product-comment-actions">
                      {!comment.isDeleted && comment.canDelete && (
                        <button
                          type="button"
                          aria-label="Delete comment"
                          disabled={activeCommentAction === `${comment.id}:delete`}
                          onClick={() => void handleDelete(comment)}
                        >
                          <FiTrash2 />
                        </button>
                      )}

                      <button
                        type="button"
                        className={comment.liked ? "liked" : ""}
                        aria-label={comment.liked ? "Unlike comment" : "Like comment"}
                        disabled={
                          comment.isDeleted ||
                          activeCommentAction === `${comment.id}:like`
                        }
                        onClick={() => void toggleCommentLike(comment)}
                      >
                        <FiHeart />
                        {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
                      </button>
                    </div>
                  </div>

                  {comment.replyToName && (
                    <span className="product-comment-replying">
                      Replying to @{comment.replyToName}
                    </span>
                  )}

                  <p className={comment.isDeleted ? "is-deleted" : ""}>
                    {comment.body}
                  </p>

                  <div className="product-comment-meta">
                    <span>{getCommentDate(comment)}</span>
                    {!comment.isDeleted && (
                      <button type="button" onClick={() => startReply(comment)}>
                        Reply
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <form className="product-comment-form" onSubmit={handleSubmit}>
          {replyTarget && (
            <div className="product-comment-reply-banner">
              <span>Replying to @{getCommentAuthor(replyTarget)}</span>
              <button type="button" onClick={() => setReplyTarget(null)}>
                Cancel
              </button>
            </div>
          )}

          <div className="product-comment-form-avatar">G</div>

          <div className="product-comment-input-wrap">
            <input
              ref={inputRef}
              type="text"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder={
                replyTarget
                  ? `Reply to ${getCommentAuthor(replyTarget)}...`
                  : "Add comment..."
              }
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
