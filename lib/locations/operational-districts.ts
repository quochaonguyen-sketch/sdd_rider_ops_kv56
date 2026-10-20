// Delivery coverage and KV assignment from the current rider plan.
export const OPERATIONAL_DISTRICTS = [
  { id: "thu-duc", code: "TD", name: "Thủ Đức", area: "KV5", aliases: ["Thủ Đức", "Quận Thủ Đức", "TP Thủ Đức", "TP. Thủ Đức", "Thành phố Thủ Đức", "Thu Duc"] },
  { id: "go-vap", code: "GV", name: "Gò Vấp", area: "KV5", aliases: ["Gò Vấp", "Quận Gò Vấp", "Go Vap", "Q Gò Vấp", "QGV"] },
  { id: "quan-12", code: "Q12", name: "Quận 12", area: "KV5", aliases: ["Quận 12", "Quan 12", "Q12", "Q.12", "Q 12", "District 12", "12"] },
  { id: "hoc-mon", code: "HM", name: "Hóc Môn", area: "KV5", aliases: ["Hóc Môn", "Huyện Hóc Môn", "Hoc Mon", "HocMon", "HM"] },
] as const;

export const OPERATIONAL_DISTRICT_NAMES: string[] = OPERATIONAL_DISTRICTS.map((district) => district.name);
export const BACKUP_DISTRICT = "BK";
export const THU_DUC_LEGACY_WARDS = ["Bình Chiểu", "Tam Bình", "Tam Phú", "Linh Đông", "Linh Tây", "Linh Chiểu", "Linh Trung", "Linh Xuân", "Hiệp Bình Chánh", "Hiệp Bình Phước", "Trường Thọ", "Bình Thọ"] as const;

export function legacyThuDucWardName(value: string | null | undefined): string | null {
  const ward = (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d").toLowerCase().trim().replace(/^(?:phuong|ward)\s+|^p[.\s]+/, "");
  const key = districtKey(ward);
  return THU_DUC_LEGACY_WARDS.find((name) => districtKey(name) === key) ?? null;
}

function districtKey(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function operationalDistrict(value: string | null | undefined) {
  const key = districtKey(value);
  return key ? OPERATIONAL_DISTRICTS.find((district) => district.aliases.some((alias) => districtKey(alias) === key)) ?? null : null;
}

export function isBackupDistrict(value: string | null | undefined) {
  return ["bk", "backup"].includes(districtKey(value));
}

export function riderDeliveryDistrict(value: string | null | undefined) {
  return operationalDistrict(value)?.name ?? (isBackupDistrict(value) ? BACKUP_DISTRICT : value?.trim() || null);
}

// Include source spellings when filtering raw snapshots, without rewriting them.
export function operationalDistrictValues(value?: string | null): string[] {
  const districts = value ? [operationalDistrict(value)].filter((district) => district !== null) : OPERATIONAL_DISTRICTS;
  return [...new Set(districts.flatMap((district) => district.aliases.flatMap((alias) => [alias, alias.toLocaleUpperCase("vi"), alias.toLocaleLowerCase("vi")])))];
}
