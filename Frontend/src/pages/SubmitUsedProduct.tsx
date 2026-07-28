import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheckCircle,
  FiCreditCard,
  FiFileText,
  FiImage,
  FiInfo,
  FiShield,
  FiX,
} from "react-icons/fi";

import UsedMarketTrustGate from "../components/UsedMarketTrustGate";
import { useAuth } from "../context/AuthContext";
import {
  createUsedListing,
  getUsedMarketTrustStatus,
} from "../services/marketplace.service";
import type { UsedListing, UsedMarketTrustStatus } from "../types/domain";

const MAX_USED_IMAGES = 10;
const MIN_USED_IMAGES = 3;

type UsedCategoryField = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number" | "date" | "textarea";
  required?: boolean;
};

type UsedCategoryConfig = {
  label: string;
  value: string;
  highRisk?: boolean;
  reviewNote: string;
  fields: UsedCategoryField[];
};

const USED_CATEGORY_CONFIGS: UsedCategoryConfig[] = [
  {
    label: "Phones/Tablets",
    value: "Phones/Tablets",
    highRisk: true,
    reviewNote: "Phones/tablets need stronger review. Add IMEI/serial and ownership proof where possible.",
    fields: [
      { name: "brand", label: "Brand", placeholder: "Apple, Samsung, Tecno", required: true },
      { name: "model", label: "Model", placeholder: "iPhone 12 Pro", required: true },
      { name: "storage", label: "Storage", placeholder: "128GB", required: true },
      { name: "ram", label: "RAM", placeholder: "6GB" },
      { name: "color", label: "Color", placeholder: "Black" },
      { name: "batteryHealth", label: "Battery health", placeholder: "87%" },
      { name: "imei", label: "IMEI/serial number", placeholder: "Optional but recommended" },
      { name: "accessories", label: "Accessories included", placeholder: "Charger, pouch, box" },
    ],
  },
  {
    label: "Laptops/Computers",
    value: "Laptops/Computers",
    highRisk: true,
    reviewNote: "Laptops/computers require detailed specs and stronger ownership review.",
    fields: [
      { name: "brand", label: "Brand", placeholder: "HP, Dell, Lenovo", required: true },
      { name: "model", label: "Model", placeholder: "EliteBook 840 G6", required: true },
      { name: "processor", label: "Processor", placeholder: "Core i5 8th Gen", required: true },
      { name: "ram", label: "RAM", placeholder: "8GB", required: true },
      { name: "storage", label: "Storage type/size", placeholder: "256GB SSD", required: true },
      { name: "screenSize", label: "Screen size", placeholder: "14 inches" },
      { name: "batteryCondition", label: "Battery condition", placeholder: "2 hours backup" },
      { name: "chargerIncluded", label: "Charger included", placeholder: "Yes/No" },
      { name: "serialNumber", label: "Serial number", placeholder: "Optional but recommended" },
    ],
  },
  {
    label: "Electronics",
    value: "Electronics",
    highRisk: true,
    reviewNote: "Electronics stay under review until admin confirms risk and proof.",
    fields: [
      { name: "brand", label: "Brand", required: true },
      { name: "model", label: "Model" },
      { name: "workingStatus", label: "Working status", placeholder: "Fully working / needs repair", required: true },
      { name: "powerRating", label: "Power rating", placeholder: "Optional" },
      { name: "warrantyReceipt", label: "Warranty/receipt", placeholder: "Available / Not available" },
      { name: "accessories", label: "Accessories included" },
    ],
  },
  {
    label: "Appliances",
    value: "Appliances",
    highRisk: true,
    reviewNote: "Appliances need pickup/delivery handling notes and proof where possible.",
    fields: [
      { name: "brand", label: "Brand", required: true },
      { name: "model", label: "Model" },
      { name: "capacitySize", label: "Capacity/size", placeholder: "120L, 6kg, etc." },
      { name: "workingStatus", label: "Working status", required: true },
      { name: "powerRating", label: "Power rating" },
      { name: "handlingNote", label: "Pickup/delivery handling note", type: "textarea" },
    ],
  },
  {
    label: "Fashion/Clothing",
    value: "Fashion/Clothing",
    reviewNote: "Fashion listings need size, condition, and branded-item disclosure.",
    fields: [
      { name: "clothingType", label: "Clothing type", required: true },
      { name: "size", label: "Size", required: true },
      { name: "color", label: "Color" },
      { name: "genderFit", label: "Gender fit/unisex" },
      { name: "brandDisclosure", label: "Original/replica disclosure", placeholder: "Original / Replica / Not branded" },
    ],
  },
  {
    label: "Shoes/Bags",
    value: "Shoes/Bags",
    reviewNote: "Shoes/bags need size and branded-item disclosure when applicable.",
    fields: [
      { name: "itemType", label: "Item type", required: true },
      { name: "brand", label: "Brand" },
      { name: "size", label: "Size if shoes" },
      { name: "color", label: "Color" },
      { name: "brandDisclosure", label: "Original/replica disclosure" },
    ],
  },
  {
    label: "Furniture/Hostel/Home Items",
    value: "Furniture/Hostel/Home Items",
    reviewNote: "Furniture needs dimensions and transport notes so riders can plan properly.",
    fields: [
      { name: "itemType", label: "Item type", required: true },
      { name: "dimensions", label: "Dimensions", placeholder: "4ft x 2ft" },
      { name: "material", label: "Material" },
      { name: "transportNote", label: "Delivery/transport note", type: "textarea" },
    ],
  },
  {
    label: "Books/Academic Items",
    value: "Books/Academic Items",
    reviewNote: "Academic items need edition/course relevance and missing-page disclosure.",
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "author", label: "Author" },
      { name: "edition", label: "Edition" },
      { name: "courseRelevance", label: "Subject/course relevance" },
      { name: "missingPagesMarks", label: "Missing pages/marks", type: "textarea" },
    ],
  },
  {
    label: "Beauty/Personal Care Items",
    value: "Beauty/Personal Care Items",
    reviewNote: "Only safe, hygienic, clearly disclosed beauty/personal care items should be listed.",
    fields: [
      { name: "itemType", label: "Item type", required: true },
      { name: "sealedStatus", label: "New/sealed/opened", required: true },
      { name: "expiryDate", label: "Expiry date", type: "date" },
      { name: "hygieneCondition", label: "Hygiene condition", required: true },
      { name: "brand", label: "Brand" },
    ],
  },
  {
    label: "Sports/Gym Items",
    value: "Sports/Gym Items",
    reviewNote: "Sports/gym items need size/weight and condition details.",
    fields: [
      { name: "itemType", label: "Item type", required: true },
      { name: "brand", label: "Brand" },
      { name: "sizeWeight", label: "Size/weight" },
    ],
  },
  {
    label: "Musical Instruments",
    value: "Musical Instruments",
    reviewNote: "Musical instruments need model, accessories, and condition details.",
    fields: [
      { name: "instrumentType", label: "Instrument type", required: true },
      { name: "brand", label: "Brand" },
      { name: "model", label: "Model" },
      { name: "accessories", label: "Accessories included" },
    ],
  },
  {
    label: "Other Items",
    value: "Other Items",
    reviewNote: "Other items still require clear defects, reason for selling, and original photos.",
    fields: [
      { name: "itemType", label: "Item type", required: true },
      { name: "extraDetails", label: "Extra details", type: "textarea" },
    ],
  },
];

function revokePreview(preview: string) {
  if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
}

function SubmitUsedProduct() {
  const { user } = useAuth();
  const [trust, setTrust] = useState<UsedMarketTrustStatus | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const previewsRef = useRef<string[]>([]);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceReference, setFaceReference] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [ownershipProof, setOwnershipProof] = useState<File | null>(null);
  const [identityProof, setIdentityProof] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [createdListing, setCreatedListing] = useState<UsedListing | null>(null);
  const [error, setError] = useState("");
  const [isLoadingTrust, setIsLoadingTrust] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    let active = true;

    void getUsedMarketTrustStatus()
      .then((response) => {
        if (active) {
          setTrust(response);
          setFaceVerified(Boolean(response.trustProfile?.faceVerified));
          setFaceReference(response.trustProfile?.faceReference || "");
        }
      })
      .catch(() => {
        if (active) setTrust(null);
      })
      .finally(() => {
        if (active) setIsLoadingTrust(false);
      });

    return () => {
      active = false;
      previewsRef.current.forEach(revokePreview);
    };
  }, []);

  function handleImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    const remaining = MAX_USED_IMAGES - imageFiles.length;
    const accepted = selected.slice(0, Math.max(0, remaining));

    setImageFiles((current) => [...current, ...accepted].slice(0, MAX_USED_IMAGES));
    setPreviews((current) => [
      ...current,
      ...accepted.map((file) => URL.createObjectURL(file)),
    ].slice(0, MAX_USED_IMAGES));

    event.target.value = "";
  }

  function removeImage(index: number) {
    setPreviews((current) => {
      const preview = current[index];
      if (preview) revokePreview(preview);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });

    setImageFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (imageFiles.length < MIN_USED_IMAGES) {
      setError(
        `Upload at least ${MIN_USED_IMAGES} clear product images from different angles.`,
      );
      return;
    }

    if (!ownershipProof) {
      setError("Upload proof that this item belongs to you.");
      return;
    }

    if (!identityProof && !trust?.trustProfile?.identityProofUrl) {
      setError("Upload a used-market seller identity proof image before submitting.");
      return;
    }

    if (!trust?.trustProfile?.isComplete && !faceVerified) {
      setError("Complete face verification to submit a used item.");
      return;
    }

    setIsSubmitting(true);

    try {
      const form = new FormData(event.currentTarget);
      form.delete("images");
      form.delete("ownershipProof");
      form.delete("identityProof");
      form.delete("receipt");

      const metadata: Record<string, string> = {};
      for (const [key, value] of form.entries()) {
        if (!key.startsWith("metadata.")) continue;
        const metadataKey = key.replace(/^metadata\./, "");
        metadata[metadataKey] = String(value || "").trim();
      }

      form.set("categoryMetadata", JSON.stringify(metadata));
      form.set("campus", String(form.get("areaLocation") || "General"));

      imageFiles.forEach((file) => form.append("images", file));
      if (ownershipProof) form.append("ownershipProof", ownershipProof);
      if (identityProof) form.append("identityProof", identityProof);
      if (receipt) form.append("receipt", receipt);
      form.set("faceVerified", faceVerified ? "true" : "false");
      form.set("faceProvider", "local");
      form.set("faceReference", faceReference || `local-face-${Date.now()}`);
      form.set("confirmOwnership", "true");
      form.set(
        "confirmOwnershipText",
        "Seller confirmed item ownership, defect disclosure, and truthful listing information.",
      );

      const response = await createUsedListing(form);
      setCreatedListing(response.listing);
      event.currentTarget.reset();
      previews.forEach(revokePreview);
      setPreviews([]);
      setImageFiles([]);
      setOwnershipProof(null);
      setReceipt(null);
      setSelectedCategory("");

      const updatedTrust = await getUsedMarketTrustStatus();
      setTrust(updatedTrust);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The used item could not be submitted.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedCategoryConfig = USED_CATEGORY_CONFIGS.find(
    (category) => category.value === selectedCategory,
  );

  function handleLocalFaceCheck() {
    setFaceVerified(true);
    setFaceReference(`local-face-${Date.now()}`);
  }

  if (createdListing) {
    return (
      <section className="submit-used-page secure-used-page">
        <div className="used-submit-success secure-success-card">
          <FiCheckCircle />
          <span>Submission received</span>
          <h1>
            {createdListing.status === "active"
              ? "Your item is live in the Used Market."
              : "Your item is waiting for Gleenc review."}
          </h1>
          <p>
            We saved your listing, trust profile, payout account, ownership proof,
            and disclosure details. Buyers will see trust badges after approval.
          </p>
          <div>
            <Link to={`/used-market/${createdListing.id}`}>View listing</Link>
            <button type="button" onClick={() => setCreatedListing(null)}>
              Submit another item
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="submit-used-page secure-used-page">
      <Link to="/used-market" className="secure-used-back">
        <FiArrowLeft />
        Back to Used Market
      </Link>

      <div className="secure-used-hero">
        <span>
          <FiShield />
          Secure Used Market
        </span>
        <h1>Upload used items with proof, payout details, and buyer trust.</h1>
        <p>
          Used products go through ownership and seller checks before buyers can
          trust them. This protects buyers, sellers, and Gleenc.
        </p>
      </div>

      {error && (
        <div className="secure-used-alert error" role="alert">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      <div className="secure-used-layout">
        <UsedMarketTrustGate trust={trust} />

        <form className="secure-used-form" onSubmit={handleSubmit}>
          <section className="secure-form-card">
            <div className="secure-form-title">
              <FiShield />
              <div>
                <span>Step 1</span>
                <h2>Seller trust profile</h2>
                <p>These details plus liveness verification help Gleenc verify the seller before approval.</p>
              </div>
            </div>

            <div className="secure-form-grid two">
              <label>
                Full name
                <input name="fullName" defaultValue={trust?.trustProfile?.fullName || user?.name || ""} required />
              </label>
              <label>
                Phone number
                <input name="trustPhone" defaultValue={trust?.trustProfile?.phone || user?.phone || ""} required />
              </label>
              <label>
                Area / location
                <input
                  name="areaLocation"
                  defaultValue={trust?.trustProfile?.areaLocation || trust?.trustProfile?.campus || user?.campus || ""}
                  placeholder="Ugbomro, Effurun, Abraka, FUPRE area..."
                  required
                />
              </label>
              <label>
                Pickup preference
                <input
                  name="pickupPreference"
                  defaultValue={trust?.trustProfile?.pickupPreference || ""}
                  placeholder="Meetup, rider pickup, safe pickup point..."
                />
              </label>
            </div>

            <div className="seller-face-check-card used-face-check-card">
              <FiShield />
              <div>
                <span>Real-time face verification</span>
                <strong>{faceVerified ? "Face check completed" : "Face check required"}</strong>
                <p>
                  Gleenc stores only the verification result and reference. Buyers never see face data.
                </p>
              </div>
              <button type="button" onClick={handleLocalFaceCheck}>
                {faceVerified ? "Run again" : "Start face check"}
              </button>
            </div>
          </section>

          <section className="secure-form-card">
            <div className="secure-form-title">
              <FiCreditCard />
              <div>
                <span>Step 2</span>
                <h2>Payout account</h2>
                <p>Money will be released here after buyer confirmation.</p>
              </div>
            </div>

            <div className="secure-form-grid three">
              <label>
                Bank name
                <input name="bankName" defaultValue={trust?.payoutAccount?.bankName || ""} placeholder="Opay, Access, GTBank..." required />
              </label>
              <label>
                Account name
                <input name="accountName" defaultValue={trust?.payoutAccount?.accountName || ""} placeholder="UGE DESTINY" required />
              </label>
              <label>
                Account number
                <input name="accountNumber" placeholder={trust?.payoutAccount?.accountNumberMasked || "10-digit account number"} required={!trust?.payoutAccount?.isComplete} />
              </label>
            </div>

            <div className="secure-used-note">
              <FiInfo />
              <p>Only the masked account and account name are stored. Buyers will not see your full account number.</p>
            </div>
          </section>

          <section className="secure-form-card">
            <div className="secure-form-title">
              <FiFileText />
              <div>
                <span>Step 3</span>
                <h2>Used item details</h2>
                <p>Clear details reduce disputes and build buyer confidence.</p>
              </div>
            </div>

            <div className="secure-form-grid two">
              <label>
                Product name
                <input name="name" placeholder="Used HP Laptop" minLength={2} maxLength={120} required />
              </label>
              <label>
                Category
                <select
                  name="category"
                  required
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                >
                  <option value="" disabled>Select category</option>
                  {USED_CATEGORY_CONFIGS.map((category) => (
                    <option value={category.value} key={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Price (₦)
                <input name="price" type="number" min="0" step="0.01" placeholder="180000" required />
              </label>
              <label>
                Available quantity
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue="1"
                  placeholder="How many are available?"
                  required
                />
              </label>
              <label>
                Condition
                <select name="condition" required defaultValue="">
                  <option value="" disabled>Select condition</option>
                  <option>Like New</option>
                  <option>Very Good</option>
                  <option>Good</option>
                  <option>Fair</option>
                  <option>Needs Repair</option>
                </select>
              </label>
              <label>
                Area / location
                <input
                  name="areaLocation"
                  defaultValue={trust?.trustProfile?.areaLocation || user?.campus || ""}
                  placeholder="Where the item is located"
                  required
                />
              </label>
              <label>
                Pickup location
                <input name="pickupLocation" placeholder="Safe pickup point, shop, estate, landmark..." required />
              </label>
              <label>
                Delivery option
                <select name="deliveryOption" defaultValue="Pickup">
                  <option>Pickup</option>
                  <option>Delivery</option>
                  <option>Pickup & Delivery</option>
                </select>
              </label>
              <label>
                Serial number / IMEI / code
                <input name="serialNumber" placeholder="Optional but recommended for gadgets" />
              </label>
            </div>

            {selectedCategoryConfig && (
              <div className="secure-category-panel">
                <div className={selectedCategoryConfig.highRisk ? "secure-used-alert warning" : "secure-used-note"}>
                  <FiInfo />
                  <p>{selectedCategoryConfig.reviewNote}</p>
                </div>

                <div className="secure-form-grid two">
                  {selectedCategoryConfig.fields.map((field) => (
                    <label key={field.name}>
                      {field.label}
                      {field.type === "textarea" ? (
                        <textarea
                          name={`metadata.${field.name}`}
                          placeholder={field.placeholder}
                          required={field.required}
                          rows={3}
                        />
                      ) : (
                        <input
                          name={`metadata.${field.name}`}
                          type={field.type || "text"}
                          placeholder={field.placeholder}
                          required={field.required}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label>
              Description
              <textarea name="description" minLength={10} maxLength={3000} placeholder="Describe the item, included accessories, usage history, battery health, etc." required />
            </label>

            <label>
              Reason for selling
              <textarea name="reasonForSelling" maxLength={800} placeholder="Example: I upgraded, moving hostel, no longer needed..." />
            </label>

            <label>
              Defect disclosure
              <textarea name="defectsDisclosed" minLength={2} maxLength={1200} placeholder="Write every known defect. If none, write 'No defects'." required />
            </label>
          </section>

          <section className="secure-form-card">
            <div className="secure-form-title">
              <FiImage />
              <div>
                <span>Step 4</span>
                <h2>Images and ownership proof</h2>
                <p>Upload clear product photos and private proof of ownership.</p>
              </div>
            </div>

            <label className="secure-file-drop large">
              <FiImage />
              <div>
                <strong>
                  Product images ({previews.length}/{MAX_USED_IMAGES}) • minimum{" "}
                  {MIN_USED_IMAGES}
                </strong>
                <p>
                  At least 3 images are required. Show the front, back, defects,
                  accessories, and serial area where relevant.
                </p>
              </div>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={handleImages} />
            </label>

            {previews.length > 0 && (
              <div className="secure-used-previews">
                {previews.map((preview, index) => (
                  <div key={preview}>
                    <img src={preview} alt={`Used product preview ${index + 1}`} />
                    <button type="button" onClick={() => removeImage(index)} aria-label="Remove image">
                      <FiX />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="secure-form-grid two">
              <label className="secure-file-drop compact">
                <FiShield />
                <div>
                  <strong>Seller identity proof</strong>
                  <p>
                    {trust?.trustProfile?.identityProofUrl
                      ? "Already submitted. Upload again only if you need to replace it."
                      : "Required. Upload a clear ID image for admin verification."}
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  required={!trust?.trustProfile?.identityProofUrl}
                  onChange={(event) => setIdentityProof(event.target.files?.[0] || null)}
                />
              </label>

              <label className="secure-file-drop compact">
                <FiShield />
                <div>
                  <strong>Ownership proof</strong>
                  <p>Required. Receipt, box, ID with product, serial proof, or proof of purchase.</p>
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setOwnershipProof(event.target.files?.[0] || null)} />
              </label>

              <label className="secure-file-drop compact">
                <FiFileText />
                <div>
                  <strong>Receipt</strong>
                  <p>Optional, but it increases buyer trust and approval confidence.</p>
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setReceipt(event.target.files?.[0] || null)} />
              </label>
            </div>
          </section>

          <section className="secure-final-confirm">
            <label>
              <input type="checkbox" required />
              <span>
                I confirm this item belongs to me, all defects have been disclosed,
                and the payout account provided is mine.
              </span>
            </label>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                isLoadingTrust ||
                imageFiles.length < MIN_USED_IMAGES
              }
            >
              <FiShield />
              {isSubmitting ? "Submitting securely..." : "Submit for Gleenc Review"}
            </button>
          </section>
        </form>
      </div>
    </section>
  );
}

export default SubmitUsedProduct;
