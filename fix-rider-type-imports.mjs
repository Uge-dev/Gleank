import fs from "node:fs";

function patch(file, replacements) {
  if (!fs.existsSync(file)) {
    console.log("Missing:", file);
    return;
  }

  let text = fs.readFileSync(file, "utf8");
  let changed = false;

  for (const [from, to] of replacements) {
    if (text.includes(from)) {
      text = text.replace(from, to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, text);
    console.log("Fixed:", file);
  }
}

patch("Frontend/src/rider/components/rider/AssignmentCard.tsx", [
  ["import { PrivateAssignment } from '../../types';", "import type { PrivateAssignment } from '../../types';"],
]);

patch("Frontend/src/rider/components/rider/DeliveryActivityList.tsx", [
  ["import { DeliveryActivity } from '../../types';", "import type { DeliveryActivity } from '../../types';"],
]);

patch("Frontend/src/rider/components/rider/EarningsChart.tsx", [
  ["import { EarningsSummary } from '../../types';", "import type { EarningsSummary } from '../../types';"],
]);

patch("Frontend/src/rider/components/rider/PaymentPanel.tsx", [
  ["import { FullDeliveryOrder } from '../../types';", "import type { FullDeliveryOrder } from '../../types';"],
]);

patch("Frontend/src/rider/components/rider/ProductList.tsx", [
  ["import { FullDeliveryOrder } from '../../types';", "import type { FullDeliveryOrder } from '../../types';"],
]);

patch("Frontend/src/rider/components/rider/ProofUploader.tsx", [
  ["import { ChangeEvent } from 'react';", "import type { ChangeEvent } from 'react';"],
]);

patch("Frontend/src/rider/components/ui/Button.tsx", [
  ["import { ButtonHTMLAttributes, ReactNode } from 'react';", "import type { ButtonHTMLAttributes, ReactNode } from 'react';"],
  ["import { IconType } from 'react-icons';", "import type { IconType } from 'react-icons';"],
]);

patch("Frontend/src/rider/components/ui/Card.tsx", [
  ["import { ReactNode } from 'react';", "import type { ReactNode } from 'react';"],
]);

patch("Frontend/src/rider/components/ui/EmptyState.tsx", [
  ["import { IconType } from 'react-icons';", "import type { IconType } from 'react-icons';"],
]);

patch("Frontend/src/rider/components/ui/Modal.tsx", [
  ["import { ReactNode } from 'react';", "import type { ReactNode } from 'react';"],
]);

patch("Frontend/src/rider/components/ui/PageHeader.tsx", [
  ["import { ReactNode } from 'react';", "import type { ReactNode } from 'react';"],
]);

patch("Frontend/src/rider/components/ui/StatCard.tsx", [
  ["import { IconType } from 'react-icons';", "import type { IconType } from 'react-icons';"],
]);

patch("Frontend/src/rider/components/ui/StatusBadge.tsx", [
  [
    "import { AssignmentStatus, Availability, CashReconciliationStatus, PaymentStatus, RiderStatus, VerificationStatus } from '../../types';",
    "import type { AssignmentStatus, Availability, CashReconciliationStatus, PaymentStatus, RiderStatus, VerificationStatus } from '../../types';"
  ],
]);

patch("Frontend/src/rider/context/AuthContext.tsx", [
  [
    "import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';",
    "import { createContext, useContext, useEffect, useMemo, useState } from 'react';\nimport type { ReactNode } from 'react';"
  ],
  [
    "import { Availability, Rider } from '../types';",
    "import type { Availability, Rider } from '../types';"
  ],
]);

patch("Frontend/src/rider/context/RiderDataContext.tsx", [
  [
    "import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';",
    "import { createContext, useContext, useEffect, useMemo, useState } from 'react';\nimport type { ReactNode } from 'react';"
  ],
  [
    "import { AssignmentStatus, DeliveryActivity, EarningsSummary, FullDeliveryOrder, NotificationItem, PrivateAssignment, SafetyReportPayload } from '../types';",
    "import type { AssignmentStatus, DeliveryActivity, EarningsSummary, FullDeliveryOrder, NotificationItem, PrivateAssignment, SafetyReportPayload } from '../types';"
  ],
]);

patch("Frontend/src/rider/data/mockData.ts", [
  [
    "import { DeliveryActivity, EarningsSummary, FullDeliveryOrder, NotificationItem, PrivateAssignment, Rider } from '../types';",
    "import type { DeliveryActivity, EarningsSummary, FullDeliveryOrder, NotificationItem, PrivateAssignment, Rider } from '../types';"
  ],
]);

patch("Frontend/src/rider/pages/auth/Login.tsx", [
  [
    "import { FormEvent, useState } from 'react';",
    "import { useState } from 'react';\nimport type { FormEvent } from 'react';"
  ],
]);

patch("Frontend/src/rider/pages/auth/Signup.tsx", [
  [
    "import { FormEvent, useState } from 'react';",
    "import { useState } from 'react';\nimport type { FormEvent } from 'react';"
  ],
]);

patch("Frontend/src/rider/pages/DeliveryDetails.tsx", [
  [
    "import { FormEvent, useState } from 'react';",
    "import { useState } from 'react';\nimport type { FormEvent } from 'react';"
  ],
  [
    "import { motion } from 'framer-motion';\n",
    ""
  ],
]);

patch("Frontend/src/rider/pages/DeliveryVerification.tsx", [
  [
    "import { FormEvent, useMemo, useState } from 'react';",
    "import { useMemo, useState } from 'react';\nimport type { FormEvent } from 'react';"
  ],
]);

patch("Frontend/src/rider/pages/Notifications.tsx", [
  ["import { IconType } from 'react-icons';", "import type { IconType } from 'react-icons';"],
  ["import { NotificationType } from '../types';", "import type { NotificationType } from '../types';"],
]);

patch("Frontend/src/rider/pages/SafetyCenter.tsx", [
  [
    "import { FormEvent, useState } from 'react';",
    "import { useState } from 'react';\nimport type { FormEvent } from 'react';"
  ],
  [
    "import { FiAlertTriangle, FiPhoneCall, FiShield, FiTool } from 'react-icons/fi';",
    "import { FiAlertTriangle, FiPhoneCall, FiTool } from 'react-icons/fi';"
  ],
  [
    "import { SafetyReportPayload } from '../types';",
    "import type { SafetyReportPayload } from '../types';"
  ],
]);

patch("Frontend/src/rider/services/riderApi.ts", [
  [
    "import { Availability, FullDeliveryOrder, NotificationItem, PrivateAssignment, ProofRecord, Rider, SafetyReportPayload } from '../types';",
    "import type { Availability, FullDeliveryOrder, NotificationItem, PrivateAssignment, ProofRecord, Rider, SafetyReportPayload } from '../types';"
  ],
]);

patch("Frontend/src/rider/services/riderLocalStore.ts", [
  [
    "import { Availability, FullDeliveryOrder, NotificationItem, PrivateAssignment, ProofRecord, Rider, SafetyReportPayload } from '../types';",
    "import type { Availability, FullDeliveryOrder, NotificationItem, PrivateAssignment, ProofRecord, Rider, SafetyReportPayload } from '../types';"
  ],
]);

patch("Frontend/src/rider/utils/status.ts", [
  [
    "import { AssignmentStatus, CashReconciliationStatus, PaymentStatus, RiderStatus, VerificationStatus } from '../types';",
    "import type { AssignmentStatus, CashReconciliationStatus, PaymentStatus, RiderStatus, VerificationStatus } from '../types';"
  ],
]);

console.log("Rider TypeScript import fixes completed.");
