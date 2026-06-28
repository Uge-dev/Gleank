import { FiShield, FiCheckCircle } from "react-icons/fi";

function UsedVerificationBanner() {
  return (
    <div className="used-verification-banner">
      <div className="used-verification-icon">
        <FiShield />
      </div>

      <div>
        <h3>Verified Used Products</h3>
        <p>
          Items listed here pass seller identity checks and product review before
          going live. Always inspect used products before final payment.
        </p>
      </div>

      <div className="used-verification-points">
        <span>
          <FiCheckCircle /> Seller checked
        </span>

        <span>
          <FiCheckCircle /> Product reviewed
        </span>

        <span>
          <FiCheckCircle /> Safer campus deals
        </span>
      </div>
    </div>
  );
}

export default UsedVerificationBanner;