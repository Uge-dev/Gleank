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

  function validateListingForm(formData: FormData) {
    const requiredFields: Array<[string, string]> = [
      ["name", createType === "product" ? "Product name is required." : "Service title is required."],
      ["category", "Category is required."],
      ["price", createType === "service" ? "Starting price is required." : "Price is required."],
      ["description", "Description is required."],
    ];

    if (createType === "product") {
      requiredFields.push(["stock", "Stock quantity is required."]);
      requiredFields.push(["packageSize", "Package size is required."]);
      requiredFields.push(["packageWeightClass", "Weight class is required."]);
      requiredFields.push(["fragilityLevel", "Fragility level is required."]);
      requiredFields.push(["packageShape", "Package shape is required."]);
      requiredFields.push(["stackability", "Stackability is required."]);
      requiredFields.push(["batchingEligibility", "Batching eligibility is required."]);
      requiredFields.push(["requiredVehicleType", "Required vehicle is required."]);
      requiredFields.push(["estimatedPackageUnits", "Package units are required."]);
      requiredFields.push(["deliveryReadinessType", "Delivery readiness timing is required."]);
    } else {
      requiredFields.push(["serviceType", "Service type is required."]);
      requiredFields.push(["location", "Service location is required."]);
      requiredFields.push(["durationMinutes", "Duration is required."]);
    }

    for (const [field, message] of requiredFields) {
      if (!String(formData.get(field) || "").trim()) {
        return message;
      }
    }

    if (Number(formData.get("price") || 0) <= 0) {
      return createType === "service" ? "Starting price must be greater than zero." : "Price must be greater than zero.";
    }

    if (createType === "product" && Number(formData.get("stock") || 0) <= 0) {
      return "Stock quantity must be at least 1 before publishing.";
    }

    if (createType === "product") {
      const readinessType = String(formData.get("deliveryReadinessType") || "immediate");
      const readinessValue = String(formData.get("deliveryReadinessValue") || "").trim();
      const readyAt = String(formData.get("deliveryReadyAt") || "").trim();

      if ((readinessType === "hours" || readinessType === "days") && Number(readinessValue || 0) < 1) {
        return readinessType === "hours"
          ? "Enter how many hours before this product is ready."
          : "Enter how many days before this product is ready.";
      }

      if (readinessType === "scheduled_date" && !readyAt) {
        return "Select the exact date/time this product will be ready.";
      }
    }

    if (previews.length < 1) {
      return "Add at least one listing image before publishing.";
    }

    return "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    const formData = new FormData(event.currentTarget);
    const validationMessage = validateListingForm(formData);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setIsSubmitting(true);

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
          message="Gleenc is preparing the listing editor."
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
          change is stored in the Gleenc database and reflected in your seller
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

            {createType === "service" && (
              <>
                <label>
                  <span>Service type</span>
                  <input
                    name="serviceType"
                    defaultValue={existingService?.serviceType || existingService?.category || ""}
                    placeholder="Repair, Makeup, Laundry, Design..."
                    required
                  />
                </label>

                <label>
                  <span>Service location</span>
                  <input
                    name="location"
                    defaultValue={existingService?.location || ""}
                    placeholder="On campus, online, hostel pickup..."
                    required
                  />
                </label>
              </>
            )}

            <label>
              <span>{createType === "service" ? "Starting price (₦)" : "Price (₦)"}</span>
              <input
                name="price"
                type="number"
                min="1"
                step="1"
                defaultValue={existingListing?.price || ""}
                placeholder="2500"
                required
              />
            </label>

            {createType === "service" && (
              <>
                <label>
                  <span>Minimum amount (₦)</span>
                  <input
                    name="minPrice"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={existingService?.minPrice || existingService?.price || ""}
                    placeholder="2000"
                  />
                </label>

                <label>
                  <span>Maximum amount (₦)</span>
                  <input
                    name="maxPrice"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={existingService?.maxPrice || ""}
                    placeholder="Optional"
                  />
                </label>
              </>
            )}

            {createType === "product" ? (
              <label>
                <span>Stock quantity</span>
                <input
                  name="stock"
                  type="number"
                  min="1"
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

            <label>
              <span>Availability</span>
              <select
                name="availabilityStatus"
                defaultValue={
                  existingListing?.availabilityStatus ||
                  (existingProduct?.stock === 0 ? "out_of_stock" : "available_now")
                }
              >
                <option value="available_now">Available now</option>
                <option value="confirm_before_payment">Confirm before payment</option>
                <option value="out_of_stock">Out of stock</option>
                <option value="price_updated">Price recently updated</option>
                <option value="substitute_available">Substitute available</option>
              </select>
            </label>

            {createType === "product" && (
              <>
                <label>
                  <span>When will this product be ready for delivery?</span>
                  <select
                    name="deliveryReadinessType"
                    defaultValue={existingProduct?.deliveryReadiness?.type || "immediate"}
                  >
                    <option value="immediate">Ready immediately</option>
                    <option value="hours">Ready in hours</option>
                    <option value="days">Ready in days</option>
                    <option value="scheduled_date">Ready on selected date</option>
                  </select>
                </label>

                <label>
                  <span>Hours/days value</span>
                  <input
                    name="deliveryReadinessValue"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue={existingProduct?.deliveryReadiness?.value || ""}
                    placeholder="Example: 3"
                  />
                </label>

                <label>
                  <span>Selected ready date/time</span>
                  <input
                    name="deliveryReadyAt"
                    type="datetime-local"
                    defaultValue={existingProduct?.deliveryReadiness?.readyAt?.slice(0, 16) || ""}
                  />
                </label>
              </>
            )}

            <label>
              <span>Return policy</span>
              <select
                name="returnPolicy"
                defaultValue={existingListing?.returnPolicy || "standard"}
              >
                <option value="standard">Standard Gleenc return window</option>
                <option value="limited">Limited return review</option>
                <option value="final_sale">Final sale after delivery check</option>
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

          {createType === "product" && (
            <section className="package-profile-panel">
              <div>
                <span>Delivery & Package Details</span>
                <h3>Help Gleenc batch and dispatch this product safely</h3>
                <p>
                  These details let the platform calculate delivery fees, split unsafe batches,
                  and match riders by capacity without relying on Google Maps.
                </p>
              </div>

              <div className="create-form-grid">
                <label>
                  <span>Package size</span>
                  <select name="packageSize" required defaultValue={existingProduct?.packageProfile?.packageSize || "small"}>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                    <option value="extra_large">Extra large</option>
                  </select>
                </label>

                <label>
                  <span>Weight class</span>
                  <select name="packageWeightClass" required defaultValue={existingProduct?.packageProfile?.packageWeightClass || "light"}>
                    <option value="very_light">Very light</option>
                    <option value="light">Light</option>
                    <option value="medium">Medium</option>
                    <option value="heavy">Heavy</option>
                    <option value="very_heavy">Very heavy</option>
                  </select>
                </label>

                <label>
                  <span>Fragility</span>
                  <select name="fragilityLevel" required defaultValue={existingProduct?.packageProfile?.fragilityLevel || "not_fragile"}>
                    <option value="not_fragile">Not fragile</option>
                    <option value="fragile">Fragile</option>
                    <option value="very_fragile">Very fragile</option>
                  </select>
                </label>

                <label>
                  <span>Package shape</span>
                  <select name="packageShape" required defaultValue={existingProduct?.packageProfile?.packageShape || "box"}>
                    <option value="envelope_or_small_pack">Envelope / small pack</option>
                    <option value="box">Box</option>
                    <option value="bag">Bag</option>
                    <option value="bottle_or_container">Bottle / container</option>
                    <option value="long_item">Long item</option>
                    <option value="bulky_item">Bulky item</option>
                  </select>
                </label>

                <label>
                  <span>Stackability</span>
                  <select name="stackability" required defaultValue={existingProduct?.packageProfile?.stackability || "stackable"}>
                    <option value="stackable">Stackable</option>
                    <option value="not_stackable">Not stackable</option>
                    <option value="stack_only_with_light_items">Stack only with light items</option>
                  </select>
                </label>

                <label>
                  <span>Batching eligibility</span>
                  <select name="batchingEligibility" required defaultValue={existingProduct?.packageProfile?.batchingEligibility || "can_batch"}>
                    <option value="can_batch">Can batch</option>
                    <option value="cannot_batch">Cannot batch</option>
                    <option value="batch_only_with_light_items">Only with light items</option>
                    <option value="batch_only_with_non_fragile_items">Only with non-fragile items</option>
                    <option value="separate_delivery_required">Separate delivery required</option>
                  </select>
                </label>

                <label>
                  <span>Required vehicle</span>
                  <select name="requiredVehicleType" required defaultValue={existingProduct?.packageProfile?.requiredVehicleType || "motorcycle_or_above"}>
                    <option value="any">Any</option>
                    <option value="walking_ok">Walking okay</option>
                    <option value="bicycle_or_above">Bicycle or above</option>
                    <option value="motorcycle_or_above">Motorcycle or above</option>
                    <option value="tricycle_or_above">Tricycle or above</option>
                    <option value="car_or_van_required">Car or van required</option>
                  </select>
                </label>

                <label>
                  <span>Package units</span>
                  <input
                    name="estimatedPackageUnits"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue={existingProduct?.packageProfile?.estimatedPackageUnits || 1}
                    required
                  />
                </label>
              </div>

              <div className="package-chip-grid">
                {["normal_handling", "keep_upright", "do_not_bend", "do_not_stack", "keep_dry", "handle_with_care"].map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      name="handlingInstructions"
                      value={item}
                      defaultChecked={(existingProduct?.packageProfile?.handlingInstructions || ["normal_handling"]).includes(item)}
                    />
                    <span>{item.replaceAll("_", " ")}</span>
                  </label>
                ))}
              </div>

              <div className="package-chip-grid">
                {["none", "fragile", "bulky", "high_value", "perishable", "requires_fast_delivery", "requires_admin_review"].map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      name="specialDeliveryFlags"
                      value={item}
                      defaultChecked={(existingProduct?.packageProfile?.specialDeliveryFlags || ["none"]).includes(item)}
                    />
                    <span>{item.replaceAll("_", " ")}</span>
                  </label>
                ))}
              </div>

              <label className="create-feature-toggle">
                <input
                  name="requiresSeparateDelivery"
                  type="checkbox"
                  value="true"
                  defaultChecked={existingProduct?.packageProfile?.requiresSeparateDelivery || false}
                />
                <span>This product should not be batched with other seller pickups</span>
              </label>

              {existingProduct?.packageProfile?.riskFlag && (
                <div className="seller-workspace-message error">
                  <FiAlertCircle />
                  <span>{existingProduct.packageProfile.riskFlag}</span>
                </div>
              )}
            </section>
          )}

          {existingListing?.moderationStatus && (
            <div className="seller-workspace-message">
              <FiAlertCircle />
              <span>
                Moderation: {existingListing.moderationStatus.replaceAll("_", " ")}
                {existingListing.moderationNote ? ` — ${existingListing.moderationNote}` : ""}
              </span>
            </div>
          )}

          <label className="create-full-label">
            <span>Description</span>
            <textarea
              name="description"
              defaultValue={existingListing?.description || ""}
              placeholder="Describe what the buyer receives, important details, delivery or booking expectations, and anything they should know."
              rows={7}
              required
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
                  required={previews.length === 0}
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
