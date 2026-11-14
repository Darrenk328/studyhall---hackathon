import { Studyhall } from "../components/Studyhall";
import { publicCategories } from "../lib/categories";

export default function Home() {
  // Public category fields only; no core code reaches the browser.
  return <Studyhall categories={publicCategories()} />;
}
