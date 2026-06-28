type UsedMarketFiltersProps = {
  isOpen: boolean;
  onClose: () => void;
};

function UsedMarketFilters({ isOpen, onClose }: UsedMarketFiltersProps) {
  if (!isOpen) return null;

  return (
    <div className="used-filter-overlay">
      <aside className="used-filter-panel">
        <div className="used-filter-header">
          <h2>Filter Used Products</h2>
          <button onClick={onClose}>×</button>
        </div>

        <div className="used-filter-group">
          <h3>Condition</h3>

          <label>
            <input type="checkbox" /> Like New
          </label>

          <label>
            <input type="checkbox" /> Very Good
          </label>

          <label>
            <input type="checkbox" /> Good
          </label>

          <label>
            <input type="checkbox" /> Fair
          </label>

          <label>
            <input type="checkbox" /> Needs Repair
          </label>
        </div>

        <div className="used-filter-group">
          <h3>Price Range</h3>

          <label>
            <input type="radio" name="price" /> ₦0 - ₦10,000
          </label>

          <label>
            <input type="radio" name="price" /> ₦10,000 - ₦50,000
          </label>

          <label>
            <input type="radio" name="price" /> ₦50,000 - ₦200,000
          </label>

          <label>
            <input type="radio" name="price" /> ₦200,000+
          </label>
        </div>

        <div className="used-filter-group">
          <h3>Verification</h3>

          <label>
            <input type="checkbox" /> Verified only
          </label>

          <label>
            <input type="checkbox" /> Recently added
          </label>

          <label>
            <input type="checkbox" /> Urgent sale
          </label>

          <label>
            <input type="checkbox" /> Delivery available
          </label>
        </div>

        <button className="apply-filter-btn" onClick={onClose}>
          Apply Filters
        </button>
      </aside>
    </div>
  );
}

export default UsedMarketFilters;