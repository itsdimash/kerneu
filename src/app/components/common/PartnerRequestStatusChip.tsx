import { Chip } from "./Chip";
import { PARTNER_STATUS_LABEL, type PartnerRequestStatus } from "../../../api/partner";

export function PartnerRequestStatusChip({ status }: { status: PartnerRequestStatus }) {
  return <Chip status={PARTNER_STATUS_LABEL[status]} />;
}
