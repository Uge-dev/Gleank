import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import type { SellerWorkspace, SellerProduct } from "../../types/domain";
import "./Commerce.css";
export default function MyProducts() {
  const { store } = useAuth();
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [editing, setEditing] = useState<SellerProduct | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    apiRequest<SellerWorkspace>("/seller/workspace").then((r) =>
      setProducts(r.products),
    );
  useEffect(() => {
    if (store) load().catch((e) => setError(e.message));
  }, [store]);
  return (
    <section className="commerce-page">
      <h1>My products</h1>
      <p>
        Manage products from your shared Gleenc account. You are responsible for
        stock and delivery.
      </p>
      {!store ? (
        <div className="commerce-card">
          <p>Add your fulfillment details before listing a product.</p>
          <Link className="commerce-action primary" to="/selling-settings">
            Set up selling
          </Link>
        </div>
      ) : (
        <>
          {error && (
            <p role="alert" className="commerce-error">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <form
            key={editing?.id || "new"}
            className="commerce-card"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = new FormData(form);
              if (editing)
                body.set(
                  "retainedImageUrls",
                  JSON.stringify(editing.imageUrls),
                );
              setBusy(true);
              setError("");
              try {
                await apiRequest(
                  "/seller/products" + (editing ? "/" + editing.id : ""),
                  { method: editing ? "PATCH" : "POST", body },
                );
                setEditing(null);
                form.reset();
                await load();
                setMessage(
                  "Product saved. Listings are reviewed before becoming publicly available.",
                );
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not save product.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>{editing ? "Edit product" : "List a product"}</h2>
            <label>
              Product name
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={editing?.name}
              />
            </label>
            <label>
              Category
              <input
                name="category"
                required
                minLength={2}
                maxLength={80}
                defaultValue={editing?.category}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                required
                minLength={10}
                maxLength={3000}
                defaultValue={editing?.description}
              />
            </label>
            <div className="commerce-grid">
              <label>
                Your selling price (₦)
                <input
                  type="number"
                  name="price"
                  min={1}
                  step="0.01"
                  required
                  defaultValue={editing?.sellerPrice || editing?.price}
                />
              </label>
              <label>
                Stock quantity
                <input
                  type="number"
                  name="stock"
                  min={0}
                  required
                  defaultValue={editing?.stock ?? 1}
                />
              </label>
            </div>
            <label>
              Sizes (comma-separated, required for clothing/footwear)
              <input
                name="availableSizes"
                defaultValue={editing?.availableSizes?.join(", ")}
              />
            </label>
            <label>
              Product images
              <input
                type="file"
                name="images"
                multiple
                accept="image/jpeg,image/png,image/webp"
                required={!editing}
              />
            </label>
            <label>
              Publication
              <select name="status" defaultValue={editing?.status || "draft"}>
                <option value="draft">Save draft</option>
                <option value="active">Submit for publication</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </label>
            <p>
              Gleenc adds its configured platform fee to the buyer price.
              Delivery is charged separately using your selling settings.
            </p>
            <div className="commerce-actions">
              <button className="primary" disabled={busy}>
                Save product
              </button>
              {editing && (
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel editing
                </button>
              )}
            </div>
          </form>
          <div className="commerce-grid">
            {products.map((product) => (
              <article className="commerce-card" key={product.id}>
                <h2>{product.name}</h2>
                <p>
                  ₦{product.price.toLocaleString()} · {product.stock} in stock
                </p>
                <p>
                  {product.status} · {product.moderationStatus}
                </p>
                <button
                  onClick={() => {
                    setEditing(product);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Edit
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
