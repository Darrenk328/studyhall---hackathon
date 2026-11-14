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

/** Decorative icon: the category name next to it is the label. One stroke weight everywhere. */
export function CategoryIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" className="cat-icon" />;
}
