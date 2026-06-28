import {
  FiCheckCircle,
  FiCreditCard,
  FiShield,
  FiUploadCloud,
} from "react-icons/fi";
import type { UsedMarketTrustStatus } from "../types/domain";

type UsedMarketTrustGateProps = {
  trust: UsedMarketTrustStatus | null;
};

function UsedMarketTrustGate({ trust }: UsedMarketTrustGateProps) {
  const profileDone = Boolean(trust?.trustProfile?.isComplete);
  const payoutDone = Boolean(trust?.payoutAccount?.isComplete);

  return (
    <aside className="used-trust-gate">
      <div className="used-trust-gate-icon">
        <FiShield />
      </div>

      <span>Secure seller setup</span>
      <h2>Build buyer trust before your used item goes live.</h2>
      <p>
        Gleank checks identity proof, ownership proof, and payout details before
        used products are approved for buyers.
      </p>

      <div className="used-trust-steps">
        <div className={profileDone ? "done" : ""}>
          <FiUploadCloud />
          <strong>Trust profile</strong>
          <small>
            {profileDone
              ? "Identity details submitted"
              : "Add student ID and campus details"}
          </small>
        </div>

        <div className={payoutDone ? "done" : ""}>
          <FiCreditCard />
          <strong>Payout account</strong>
          <small>
            {payoutDone
              ? `${trust?.payoutAccount?.bankName} • ${trust?.payoutAccount?.accountNumberMasked}`
              : "Add account for future seller payout"}
          </small>
        </div>

        <div className={profileDone && payoutDone ? "done" : ""}>
          <FiCheckCircle />
          <strong>Review ready</strong>
          <small>
            {profileDone && payoutDone
              ? "You can submit used listings"
              : "Complete both steps to continue"}
          </small>
        </div>
      </div>
    </aside>
  );
}

export default UsedMarketTrustGate;
