import type { CSSProperties } from "react";
import {
  Briefcase,
  FlaskConical,
  Gamepad2,
  GraduationCap,
  Landmark,
  Laptop,
  Palette,
  Plane,
  Scale,
  Sparkles,
  Stethoscope,
  Trophy,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Explicit map so only these icons ship. Keys are the `icon` names in the category configs. */
const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  "gamepad-2": Gamepad2,
  stethoscope: Stethoscope,
  briefcase: Briefcase,
  landmark: Landmark,
  laptop: Laptop,
  "flask-conical": FlaskConical,
  scale: Scale,
  plane: Plane,
  "utensils-crossed": UtensilsCrossed,
  trophy: Trophy,
  "graduation-cap": GraduationCap,
  palette: Palette,
  wrench: Wrench,
};

/** Each subject gets a hue from the logo's rainbow (blue → violet → pink → orange), in sidebar order. */
const HUES: Record<string, string> = {
  sparkles: "#a99bff",
  "gamepad-2": "#5b8cff",
  stethoscope: "#4fb0ff",
  briefcase: "#45c4d9",
  landmark: "#4fd1a5",
  laptop: "#6f9bff",
  wrench: "#8f7bff",
  "flask-conical": "#a970ff",
  scale: "#c36bf0",
  plane: "#e06bd6",
  "utensils-crossed": "#f06ba8",
  trophy: "#ff8a6b",
  "graduation-cap": "#ffae5c",
  palette: "#ffc65c",
};

/** Decorative tile: the category name next to it is the label. One stroke weight everywhere. */
export function CategoryIcon({ name, size = 15 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Sparkles;
  return (
    <span className="cat-icon" style={{ "--hue": HUES[name] ?? "#a99bff" } as CSSProperties} aria-hidden="true">
      <Icon size={size} strokeWidth={2} focusable="false" />
    </span>
  );
}
