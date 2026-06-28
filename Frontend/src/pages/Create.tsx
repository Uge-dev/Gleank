import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiPackage,
  FiSave,
  FiTag,
  FiTool,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";

import LoadingState from "../components/LoadingState";
import {
  createSellerProduct,
  createSellerService,
  getSellerWorkspace,
  updateSellerProduct,
  updateSellerService,
} from "../services/seller.service";
import type { SellerProduct, SellerService } from "../types/domain";
import { resolveMediaUrl } from "../utils/media";

type CreateType = "product" | "service";

const MAX_LISTING_IMAGES = 10;

function revokeBlobPreview(preview: string) {
  if (preview.startsWith("blob:")) {
    URL.revokeObjectURL(preview);
  }
}

function Create() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedType = searchParams.get("type");
  const listingId = searchParams.get("id");

  const [createType, setCreateType] = useState<CreateType>(
    requestedType === "service" ? "service" : "product",
  );

  const [existingListing, setExistingListing] = useState<
    SellerProduct | SellerService | null
  >(null);

  const [previews, setPreviews] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const previewsRef = useRef<string[]>([]);

  const [isLoading, setIsLoading] = useState(Boolean(listingId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach(revokeBlobPreview);
    };
  }, []);

  useEffect(() => {
    if (!listingId) {
      setExistingListing(null);
      setIsLoading(false);
      return;
    }

    let active = true;

    void getSellerWorkspace()
      .then((workspace) => {
        if (!active) return;

        const collection =
          createType === "product" ? workspace.products : workspace.services;

        const listing = collection.find((item) => item.id === listingId) || null;

        previewsRef.current.forEach(revokeBlobPreview);

        setExistingListing(listing);
        setImageFiles([]);
        setPreviews(listing?.imageUrls || []);

        if (!listing) {
          setError("The listing you want to edit was not found.");
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "The listing could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [createType, listingId]);

  const isEditing = Boolean(existingListing);

  const existingProduct =
    createType === "product" && existingListing && "stock" in existingListing
      ? existingListing
      : null;

  const existingService =
    createType === "service" &&
    existingListing &&
    "durationMinutes" in existingListing
      ? existingListing
      : null;

  const retainedImageUrls = useMemo(
    () => previews.filter((preview) => !preview.startsWith("blob:")),
    [previews],
  );

  function changeType(nextType: CreateType) {
    if (isSubmitting) return;

    previews.forEach(revokeBlobPreview);

    setCreateType(nextType);
    setExistingListing(null);
    setPreviews([]);
    setImageFiles([]);
    setError("");

    const next = new URLSearchParams(searchParams);
    next.set("type", nextType);
    next.delete("id");
    setSearchParams(next);
  }

  function handleImages(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);
    const remainingSlots = MAX_LISTING_IMAGES - previews.length;

    if (remainingSlots <= 0) {
      event.target.value = "";
      return;
    }

    const files = selectedFiles.slice(0, remainingSlots);
    const nextPreviews = files.map((file) => URL.createObjectURL(file));

    setImageFiles((current) =>
      [...current, ...files].slice(0, MAX_LISTING_IMAGES),
    );

    setPreviews((current) =>
      [...current, ...nextPreviews].slice(0, MAX_LISTING_IMAGES),
    );

    event.target.value = "";
  }

  function removePreview(index: number) {
    setPreviews((current) => {
      const preview = current[index];

      if (preview?.startsWith("blob:")) {
        URL.revokeObjectURL(preview);

        const blobIndex = current
          .slice(0, index + 1)
          .filter((item) => item.startsWith("blob:")).length - 1;

        setImageFiles((files) =>
          files.filter((_, fileIndex) => fileIndex !== blobIndex),
        );
      }

      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    formData.delete("images");
    formData.set("retainedImageUrls", JSON.stringify(retainedImageUrls));

    imageFiles.forEach((file) => {
      formData.append("images", file);
    });

    try {
      if (createType === "product") {
        if (listingId) {
          await updateSellerProduct(listingId, formData);
        } else {
          await createSellerProduct(formData);
        }
      } else if (listingId) {
        await updateSellerService(listingId, formData);
      } else {
        await createSellerService(formData);
      }

      previews.forEach(revokeBlobPreview);

      navigate("/dashboard", {
        replace: true,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The listing could not be saved.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="create-page seller-create-page">
        <LoadingState
          title="Loading listing"
          message="Gleank is preparing the listing editor."
        />
      </section>
    );
  }

  return (
    <section className="create-page seller-create-page">
      <Link to="/dashboard" className="seller-create-back">
        <FiArrowLeft />
        Seller dashboard
      </Link>

      <div className="create-header seller-create-header">
        <span>{isEditing ? "Edit listing" : "Create listing"}</span>

        <h1>
          {isEditing
            ? `Update ${existingListing?.name}`
            : "Publish something students can trust."}
        </h1>

        <p>
          Add accurate pricing, availability, details, and clear images. Every
          change is stored in the Gleank database and reflected in your seller
          workspace.
        </p>
      </div>

      {error && (
        <div className="seller-workspace-message error" role="alert">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      <div className="create-layout seller-create-layout">
        <aside className="create-side-card seller-create-guide">
          <div className="create-type-switch">
            <button
              type="button"
              className={createType === "product" ? "active" : ""}
              onClick={() => changeType("product")}
            >
              <FiPackage />
              Product
            </button>

            <button
              type="button"
              className={createType === "service" ? "active" : ""}
              onClick={() => changeType("service")}
            >
              <FiTool />
              Service
            </button>
          </div>

          <div className="seller-create-checklist">
            <h2>Listing quality checklist</h2>
            <span>
              <FiCheckCircle /> Use clear, original images
            </span>
            <span>
              <FiCheckCircle /> Keep prices and stock accurate
            </span>
            <span>
              <FiCheckCircle /> Explain delivery or booking details
            </span>
            <span>
              <FiCheckCircle /> Save drafts before publishing
            </span>
          </div>
        </aside>

        <form
          className="create-form-card seller-listing-form"
          onSubmit={handleSubmit}
        >
          <div className="create-form-title">
            <span>{createType}</span>

            <h2>
              {isEditing
                ? `Edit ${createType}`
                : `Create ${createType} listing`}
            </h2>

            <p>Required fields are validated by both the browser and API.</p>
          </div>

          <div className="create-form-grid">
            <label>
              <span>
                {createType === "product" ? "Product name" : "Service title"}
              </span>
              <input
                name="name"
                defaultValue={existingListing?.name || ""}
                placeholder={
                  createType === "product"
                    ? "Jollof Rice Combo"
                    : "Phone Screen Repair"
                }
                required
              />
            </label>

            <label>
              <span>Category</span>
              <input
                name="category"
                defaultValue={existingListing?.category || ""}
                placeholder="Food, Fashion, Repairs..."
                required
              />
            </label>

            <label>
              <span>Price (₦)</span>
              <input
                name="price"
                type="number"
                min="0"
                step="1"
                defaultValue={existingListing?.price || ""}
                placeholder="2500"
                required
              />
            </label>

            {createType === "product" ? (
              <label>
                <span>Stock quantity</span>
                <input
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={existingProduct?.stock ?? 1}
                  required
                />
              </label>
            ) : (
              <label>
                <span>Duration (minutes)</span>
                <input
                  name="durationMinutes"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={existingService?.durationMinutes ?? 60}
                  required
                />
              </label>
            )}

            <label>
              <span>Visibility</span>
              <select
                name="status"
                defaultValue={existingListing?.status || "draft"}
              >
                <option value="draft">Save as draft</option>
                <option value="active">Publish now</option>

                {createType === "product" ? (
                  <option value="out_of_stock">Out of stock</option>
                ) : (
                  <option value="paused">Paused</option>
                )}
              </select>
            </label>

            <label className="create-feature-toggle">
              <input
                name="isFeatured"
                type="checkbox"
                value="true"
                defaultChecked={existingListing?.isFeatured || false}
              />
              <span>Show this {createType} in the store’s Favorites tab</span>
            </label>
          </div>

          <label className="create-full-label">
            <span>Description</span>
            <textarea
              name="description"
              defaultValue={existingListing?.description || ""}
              placeholder="Describe what the buyer receives, important details, delivery or booking expectations, and anything they should know."
              rows={7}
            />
          </label>

          <div className="seller-image-manager">
            <div>
              <span>Listing media</span>
              <strong>
                Images ({previews.length}/{MAX_LISTING_IMAGES})
              </strong>
              <p>
                JPEG, PNG, WebP, or GIF. Maximum 5 MB per image. Up to{" "}
                {MAX_LISTING_IMAGES} images.
              </p>
            </div>

            {previews.length > 0 && (
              <div className="seller-image-preview-grid">
                {previews.map((preview, index) => (
                  <div key={`${preview}-${index}`}>
                    <img
                      src={
                        preview.startsWith("blob:")
                          ? preview
                          : resolveMediaUrl(preview, preview)
                      }
                      alt={`Listing preview ${index + 1}`}
                    />

                    <button
                      type="button"
                      onClick={() => removePreview(index)}
                      aria-label={`Remove image ${index + 1}`}
                    >
                      <FiX />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {previews.length < MAX_LISTING_IMAGES && (
              <label className="create-upload-box seller-create-upload">
                <FiUploadCloud />
                <strong>Add listing images</strong>
                <p>
                  Select up to {MAX_LISTING_IMAGES} clear images from your Mac.
                </p>
                <p>
                  JPEG, PNG, WebP, or GIF. Maximum 5 MB per image. Up to{" "}
                  {MAX_LISTING_IMAGES} images.
                </p>

                <input
                  name="images"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={handleImages}
                />
              </label>
            )}
          </div>

          <div className="seller-create-footer">
            <div>
              <FiTag />
              <p>
                {createType === "product"
                  ? "Stock automatically changes to out-of-stock when quantity reaches zero."
                  : "Paused services remain saved but are hidden from buyers."}
              </p>
            </div>

            <button
              className="create-submit-btn"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                "Saving listing..."
              ) : (
                <>
                  <FiSave />
                  {isEditing ? "Save changes" : "Create listing"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default Create;