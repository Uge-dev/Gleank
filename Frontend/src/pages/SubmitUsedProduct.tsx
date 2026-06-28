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
  FiUploadCloud,
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

function revokePreview(preview: string) {
  if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
}

function SubmitUsedProduct() {
  const { user } = useAuth();
  const [trust, setTrust] = useState<UsedMarketTrustStatus | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const previewsRef = useRef<string[]>([]);
  const [identityProof, setIdentityProof] = useState<File | null>(null);
  const [ownershipProof, setOwnershipProof] = useState<File | null>(null);
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
        if (active) setTrust(response);
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

    if (!imageFiles.length) {
      setError("Upload at least one clear product image.");
      return;
    }

    if (!ownershipProof) {
      setError("Upload proof that this item belongs to you.");
      return;
    }

    if (!trust?.trustProfile?.isComplete && !identityProof) {
      setError("Upload a student ID or identity proof image to complete your trust profile.");
      return;
    }

    setIsSubmitting(true);

    try {
      const form = new FormData(event.currentTarget);
      form.delete("images");
      form.delete("identityProof");
      form.delete("ownershipProof");
      form.delete("receipt");

      imageFiles.forEach((file) => form.append("images", file));
      if (identityProof) form.append("identityProof", identityProof);
      if (ownershipProof) form.append("ownershipProof", ownershipProof);
      if (receipt) form.append("receipt", receipt);
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
      setIdentityProof(null);
      setOwnershipProof(null);
      setReceipt(null);

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

  if (createdListing) {
    return (
      <section className="submit-used-page secure-used-page">
        <div className="used-submit-success secure-success-card">
          <FiCheckCircle />
          <span>Submission received</span>
          <h1>
            {createdListing.status === "active"
              ? "Your item is live in the Used Market."
              : "Your item is waiting for Gleank review."}
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
          trust them. This protects buyers, sellers, and Gleank.
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
                <p>These details help Gleank verify the seller before approval.</p>
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
                Campus
                <input name="trustCampus" defaultValue={trust?.trustProfile?.campus || user?.campus || ""} required />
              </label>
              <label>
                Student ID / Matric number
                <input name="studentId" defaultValue={trust?.trustProfile?.studentId || ""} required />
              </label>
              <label>
                Department
                <input name="department" defaultValue={trust?.trustProfile?.department || ""} placeholder="Chemical Engineering" />
              </label>
              <label>
                Level
                <input name="level" defaultValue={trust?.trustProfile?.level || ""} placeholder="400L" />
              </label>
            </div>

            <label className="secure-file-drop">
              <FiUploadCloud />
              <div>
                <strong>Student ID / identity proof</strong>
                <p>
                  {trust?.trustProfile?.identityProofUrl
                    ? "Already submitted. Upload again only if you want to replace it."
                    : "Required before your used product can be submitted."}
                </p>
              </div>
              <input
                name="identityProof"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => setIdentityProof(event.target.files?.[0] || null)}
              />
            </label>
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
              <p>Only the masked account and account name are stored for this development flow. Buyers will not see your full account number.</p>
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
                <input name="category" placeholder="Phones, Laptops, Books..." required />
              </label>
              <label>
                Price (₦)
                <input name="price" type="number" min="0" step="0.01" placeholder="180000" required />
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
                Campus
                <input name="campus" defaultValue={user?.campus || ""} required />
              </label>
              <label>
                Pickup location
                <input name="pickupLocation" placeholder="Hostel area, campus gate, department..." required />
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
                <strong>Product images ({previews.length}/{MAX_USED_IMAGES})</strong>
                <p>Upload up to 10 clear images. Show front, back, defects, accessories, and serial area if needed.</p>
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

            <button type="submit" disabled={isSubmitting || isLoadingTrust}>
              <FiShield />
              {isSubmitting ? "Submitting securely..." : "Submit for Gleank Review"}
            </button>
          </section>
        </form>
      </div>
    </section>
  );
}

export default SubmitUsedProduct;
