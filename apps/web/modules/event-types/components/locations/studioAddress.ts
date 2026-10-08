import type { LocationOption } from "@calcom/features/form/components/LocationSelect";

export function buildStudioLocationOptions(
  options: readonly LocationOption[],
  address: string,
  translate: (key: string) => string
): LocationOption[] {
  return options.flatMap((option) =>
    option.value === "inPerson"
      ? [
          {
            ...option,
            label: translate("in_person_saved_address"),
            address: address.trim(),
            disabled: !address.trim(),
          },
          { ...option, label: translate("in_person_enter_address"), address: undefined },
        ]
      : [option]
  );
}

export function getStudioLocationAddress(option: LocationOption): { address?: string } {
  return option.value === "inPerson" ? { address: option.address?.trim() || "" } : {};
}
