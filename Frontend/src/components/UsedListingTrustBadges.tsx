import {
  FiCheckCircle,
  FiCreditCard,
  FiEye,
  FiShield,
  FiTruck,
} from "react-icons/fi";
import type { UsedListing } from "../types/domain";

type UsedListingTrustBadgesProps = {
  listing: UsedListing;
  compact?: boolean;
};

function UsedListingTrustBadges({ listing, compact = false }: UsedListingTrustBadgesProps) {
  const trust = listing.sellerTrust;

  const badges = [
    {
      label: trust?.profileCompleted ? "Profile completed" : "Profile pending",
      ok: Boolean(trust?.profileCompleted),
      icon: <FiCheckCircle />,
    },
    {
      label: trust?.identityProofSubmitted ? "ID proof submitted" : "ID proof pending",
      ok: Boolean(trust?.identityProofSubmitted),
      icon: <FiShield />,
    },
    {
      label: trust?.payoutAccountAdded ? "Payout added" : "Payout pending",
      ok: Boolean(trust?.payoutAccountAdded),
      icon: <FiCreditCard />,
    },
    {
      label: listing.status === "active" ? "Gleank reviewed" : "Pending review",
      ok: listing.status === "active",
      icon: <FiEye />,
    },
    {
      label: "Buyer payment protected",
      ok: true,
      icon: <FiTruck />,
    },
  ];

  return (
    <div className={compact ? "used-trust-badges compact" : "used-trust-badges"}>
      {badges.map((badge) => (
        <span className={badge.ok ? "ok" : "pending"} key={badge.label}>
          {badge.icon}
          {badge.label}
        </span>
      ))}
    </div>
  );
}

export default UsedListingTrustBadges;
