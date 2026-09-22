export const publicPagePalettes = [
  { id: "sage", accent: "#356859", background: "#edf4ef", soft: "#dcebe1" },
  { id: "ocean", accent: "#285a9b", background: "#eef4fc", soft: "#dce8f8" },
  { id: "rose", accent: "#a13f63", background: "#fcf0f4", soft: "#f5dfe7" },
  { id: "lavender", accent: "#7051a3", background: "#f4f0fb", soft: "#e9dff6" },
  { id: "sand", accent: "#87612f", background: "#faf5eb", soft: "#efe3cc" },
  { id: "teal", accent: "#167176", background: "#edf8f7", soft: "#d5edeb" },
] as const;

export function getPublicPagePalette(brandColor?: string | null) {
  return (
    publicPagePalettes.find((palette) => palette.accent === brandColor?.toLowerCase()) ??
    publicPagePalettes[0]
  );
}
